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
  Boolean(
    error &&
      typeof error === 'object' &&
      (String((error as { code?: string }).code || '') === '23502' ||
        String((error as { message?: string }).message || '').toLowerCase().includes('null value')) &&
      [String((error as { message?: string }).message || ''), String((error as { details?: string }).details || '')]
        .join(' ')
        .toLowerCase()
        .includes('car_id')
  );

const getAgreementSaveSchemaMessage = (error: unknown) => {
  if (isCarIdRequiredError(error)) {
    return 'Agreement storage is missing manual vehicle support: lease_agreements.car_id must allow blank values. Apply the manual vehicle agreement migration and retry.';
  }

  if (isMissingVehicleLabelColumnError(error)) {
    return 'Agreement storage is missing manual vehicle support: lease_agreements.vehicle_label is not available. Apply the manual vehicle agreement migration and retry.';
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

    const insertPayload = {
      ...data,
      car_id: data.car_id ?? null,
      vehicle_label: data.vehicle_label || null,
    };
    const existingQuery = db
      .from('lease_agreements')
      .select('id')
      .eq('application_id', data.application_id)
      .eq('content', data.content);

    const { data: existing, error: existingError } =
      data.vehicle_label
        ? await existingQuery.eq('vehicle_label', data.vehicle_label).maybeSingle()
        : await existingQuery.maybeSingle();

    if (existingError && !isMissingVehicleLabelColumnError(existingError)) {
      throw existingError;
    }

    if (existing?.id) {
      return res.status(200).json({ id: String(existing.id), duplicate: true });
    }

    let { data: inserted, error } = await db.from('lease_agreements').insert([insertPayload]).select('id').single();

    if (error && isMissingVehicleLabelColumnError(error)) {
      const {
        vehicle_label: _vehicleLabel,
        ...legacyInsertPayload
      } = insertPayload;
      const retry = await db
        .from('lease_agreements')
        .insert([legacyInsertPayload])
        .select('id')
        .single();
      inserted = retry.data;
      error = retry.error;
    }

    if (error) {
      const schemaMessage = getAgreementSaveSchemaMessage(error);
      if (schemaMessage) {
        return res.status(503).json({ error: schemaMessage });
      }
      throw error;
    }
    res.status(201).json({ id: String(inserted.id) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.issues });
    }
    const schemaMessage = getAgreementSaveSchemaMessage(err);
    if (schemaMessage) {
      return res.status(503).json({ error: schemaMessage });
    }
    console.error('Lease agreement creation error:', err);
    res.status(500).json({ error: 'Failed to save lease agreement. Please try again or contact support if it continues.' });
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
