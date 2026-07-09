import express from 'express';
import { db } from '../db/index.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { renderActiveAgreementTemplate } from '../agreementTemplates.js';
import { leaseAgreementSchema, createLeaseAgreementSchema } from '../validation.js';
import { z } from 'zod';
import { getApplicationSelectColumns } from '../schemaCompat.js';
import {
  getImportedApplicationIdSet,
  isImportedApplicationRecord,
} from '../importedDataFilters.js';

const router = express.Router();

type LeaseAgreementRecord = {
  application_id: string;
  car_id?: number | null;
  content: string;
  created_at: string;
  id: number;
  status: string;
  vehicle_label?: string | null;
};

type DatabaseError = {
  code?: string;
  column?: string;
  constraint?: string;
  message?: string;
  table?: string;
};

const getDatabaseError = (error: unknown): DatabaseError =>
  error && typeof error === 'object' ? (error as DatabaseError) : {};

const getDatabaseErrorCode = (error: unknown) =>
  String(getDatabaseError(error).code || '').toUpperCase();

const getDatabaseErrorMessage = (error: unknown) =>
  String(getDatabaseError(error).message || 'Database operation failed')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);

const inferDatabaseErrorValue = (
  error: unknown,
  property: 'column' | 'constraint' | 'table',
) => {
  const databaseError = getDatabaseError(error);
  if (databaseError[property]) return String(databaseError[property]);

  const patterns = {
    column: /column ["']([^"']+)["']/i,
    constraint: /constraint ["']([^"']+)["']/i,
    table: /relation ["']([^"']+)["']/i,
  } as const;
  return databaseError.message?.match(patterns[property])?.[1] || null;
};

const logAgreementSaveError = (error: unknown, operation: string) => {
  console.error('Lease agreement save failed', {
    code: getDatabaseErrorCode(error) || null,
    column: inferDatabaseErrorValue(error, 'column'),
    constraint: inferDatabaseErrorValue(error, 'constraint'),
    message: getDatabaseErrorMessage(error),
    operation,
    table: inferDatabaseErrorValue(error, 'table') || 'lease_agreements',
  });
};

const isRequiredColumnError = (error: unknown, column: string) =>
  getDatabaseErrorCode(error) === '23502' &&
  getDatabaseErrorMessage(error).toLowerCase().includes(column.toLowerCase());

const isMissingVehicleLabelColumnError = (error: unknown) =>
  Boolean(
    error &&
      typeof error === 'object' &&
      ['PGRST204', '42703'].includes(String((error as { code?: string }).code || '').toUpperCase()) &&
      [String((error as { message?: string }).message || ''), String((error as { details?: string }).details || '')]
        .join(' ')
        .toLowerCase()
        .includes('vehicle_label')
  );

const isCarIdRequiredError = (error: unknown) =>
  isRequiredColumnError(error, 'car_id');

const isLegacyApplicationIdRequiredError = (error: unknown) =>
  isRequiredColumnError(error, 'legacy_application_id');

const isUniqueViolationError = (error: unknown) =>
  getDatabaseErrorCode(error) === '23505';

const getAgreementSaveSchemaMessage = (error: unknown) => {
  if (isCarIdRequiredError(error)) {
    return 'Agreement storage is missing manual vehicle support: lease_agreements.car_id must allow blank values. Apply the manual vehicle agreement migration and retry.';
  }

  if (isMissingVehicleLabelColumnError(error)) {
    return 'Agreement storage is missing manual vehicle support: lease_agreements.vehicle_label is not available. Apply the manual vehicle agreement migration and retry.';
  }

  if (isLegacyApplicationIdRequiredError(error)) {
    return 'Agreement storage still requires a retired application ID. Apply the lease agreement idempotency migration and retry.';
  }

  return null;
};

const enrichLeaseAgreements = async (
  agreements: LeaseAgreementRecord[]
) => {
  const applicationIds = Array.from(
    new Set(
      agreements
        .map((agreement) => agreement.application_id)
        .filter((id) => id.length > 0)
    )
  );
  const carIds = Array.from(
    new Set(
      agreements
        .map((agreement) => Number(agreement.car_id || 0))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );

  const [applicationsResult, carsResult] = await Promise.all([
    applicationIds.length > 0
      ? db.from('applications').select('*').in('id', applicationIds)
      : Promise.resolve({ data: [], error: null }),
    carIds.length > 0
      ? db.from('cars').select('id, name').in('id', carIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (applicationsResult.error) {
    throw applicationsResult.error;
  }

  if (carsResult.error) {
    throw carsResult.error;
  }

  const applicationNames = new Map<string, string>();
  const importedApplicationIds = getImportedApplicationIdSet(
    (applicationsResult.data || []) as Array<Record<string, any>>,
  );
  for (const application of applicationsResult.data || []) {
    applicationNames.set(String(application.id), String(application.name || ''));
  }

  const carNames = new Map<number, string>();
  for (const car of carsResult.data || []) {
    carNames.set(Number(car.id), String(car.name || ''));
  }

  return agreements
    .filter((agreement) => !importedApplicationIds.has(String(agreement.application_id)))
    .map((agreement) => ({
      ...agreement,
      applicant_name: applicationNames.get(agreement.application_id) || undefined,
      car_name:
        carNames.get(Number(agreement.car_id || 0)) ||
        agreement.vehicle_label ||
        undefined,
    }));
};

router.get('/car-lease/template', authenticateAdmin, async (_req, res) => {
  const { agreement: template } = await renderActiveAgreementTemplate();
  res.type('text/markdown').send(template);
});

router.post('/car-lease/render', authenticateAdmin, async (req, res) => {
  try {
    const payload = leaseAgreementSchema.parse(req.body ?? {});
    const rendered = await renderActiveAgreementTemplate(payload);
    res.json({ agreement: rendered.agreement });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }
    console.error('Render agreement error:', error);
    res.status(500).json({ error: 'Failed to render agreement' });
  }
});

router.post('/', authenticateAdmin, async (req, res) => {
  let saveOperation = 'validate';
  try {
    const data = createLeaseAgreementSchema.parse(req.body);
    const applicationSelectColumns = await getApplicationSelectColumns();
    const { data: application, error: applicationError } = await db
      .from('applications')
      .select(applicationSelectColumns)
      .eq('id', data.application_id)
      .single();

    if (applicationError || !application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const applicationRecord = application as unknown as Record<string, unknown>;

    if (isImportedApplicationRecord(applicationRecord)) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (String(applicationRecord.status) !== 'Paid') {
      return res.status(409).json({
        error: 'Lease agreements can only be created after driver payment is completed.',
      });
    }

    const savePayload = {
      application_id: data.application_id,
      car_id: null,
      content: data.content,
      status: data.status,
      vehicle_label: data.vehicle_label || null,
    };
    saveOperation = 'find-existing';
    const findExistingAgreement = () => db
      .from('lease_agreements')
      .select('id, content')
      .eq('application_id', data.application_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const updateAgreement = async (id: number | string) => {
      saveOperation = 'update';
      let result = await db
        .from('lease_agreements')
        .update(savePayload)
        .eq('id', id)
        .select('id')
        .single();

      if (result.error && isMissingVehicleLabelColumnError(result.error)) {
        const { vehicle_label: _vehicleLabel, ...legacySavePayload } = savePayload;
        result = await db
          .from('lease_agreements')
          .update(legacySavePayload)
          .eq('id', id)
          .select('id')
          .single();
      }

      return result;
    };

    const { data: existing, error: existingError } = await findExistingAgreement();
    if (existingError) throw existingError;

    if (existing?.id) {
      const updated = await updateAgreement(existing.id);
      if (updated.error) throw updated.error;
      return res.status(200).json({
        id: String(updated.data.id),
        duplicate: existing.content === data.content,
        updated: true,
      });
    }

    saveOperation = 'insert';
    let { data: inserted, error } = await db.from('lease_agreements').insert([savePayload]).select('id').single();

    if (error && isMissingVehicleLabelColumnError(error)) {
      const {
        vehicle_label: _vehicleLabel,
        ...legacyInsertPayload
      } = savePayload;
      const retry = await db
        .from('lease_agreements')
        .insert([legacyInsertPayload])
        .select('id')
        .single();
      inserted = retry.data;
      error = retry.error;
    }

    if (error && isUniqueViolationError(error)) {
      const racedExisting = await findExistingAgreement();
      if (racedExisting.error) throw racedExisting.error;
      if (racedExisting.data?.id) {
        const updated = await updateAgreement(racedExisting.data.id);
        if (updated.error) throw updated.error;
        return res.status(200).json({
          id: String(updated.data.id),
          duplicate: racedExisting.data.content === data.content,
          updated: true,
        });
      }
    }

    if (error) throw error;
    res.status(201).json({ id: String(inserted.id) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.issues });
    }
    logAgreementSaveError(err, saveOperation);
    const schemaMessage = getAgreementSaveSchemaMessage(err);
    if (schemaMessage) {
      return res.status(503).json({ error: schemaMessage });
    }
    const code = getDatabaseErrorCode(err);
    if (code === '23503') {
      return res.status(409).json({ error: 'The application is no longer available for agreement saving.' });
    }
    if (code === '42501') {
      return res.status(503).json({ error: 'Agreement storage permissions rejected the save. Contact support.' });
    }
    res.status(500).json({
      error: 'Failed to save lease agreement. Please try again or contact support if it continues.',
      ...(code ? { code } : {}),
    });
  }
});

router.get('/', authenticateAdmin, async (_req, res) => {
  try {
    const { data, error } = await db
      .from('lease_agreements')
      .select('id, application_id, car_id, vehicle_label, content, status, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(
      await enrichLeaseAgreements((data || []) as LeaseAgreementRecord[])
    );
  } catch (error) {
    console.error('Fetch lease agreements error:', error);
    res.status(500).json({ error: 'Failed to fetch lease agreements' });
  }
});

router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const parsedParams = z
      .object({ id: z.coerce.number().int().positive() })
      .safeParse(req.params);

    if (!parsedParams.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsedParams.error.issues });
    }

    const { data, error } = await db
      .from('lease_agreements')
      .select('id, application_id, car_id, vehicle_label, content, status, created_at')
      .eq('id', parsedParams.data.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Lease agreement not found' });
    }

    const [agreement] = await enrichLeaseAgreements([
      data as LeaseAgreementRecord,
    ]);
    res.json(agreement);
  } catch (error) {
    console.error('Fetch lease agreement error:', error);
    res.status(500).json({ error: 'Failed to fetch lease agreement' });
  }
});

router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const parsedParams = z
      .object({ id: z.coerce.number().int().positive() })
      .safeParse(req.params);

    if (!parsedParams.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsedParams.error.issues });
    }

    const { error } = await db.from('lease_agreements').delete().eq('id', parsedParams.data.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Lease agreement deletion error:', error);
    res.status(500).json({ error: 'Failed to delete lease agreement' });
  }
});

export default router;
