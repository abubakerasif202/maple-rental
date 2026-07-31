import path from 'node:path';

import express from 'express';
import multer from 'multer';
import { z } from 'zod';

import { withPostgresTransaction } from '../db/postgres.js';
import { authenticateAdmin, requireTrustedAdminWriteOrigin } from '../middleware/auth.js';
import {
  assertFleetRentalRegistrationMatch,
  assertMutableFleetImportRow,
  buildFleetApplyAuditMetadata,
  FLEET_IMPORT_MAX_FILE_SIZE,
  normalizeFleetDriverName,
  normalizeFleetRegistration,
  getFleetDryRunValidationConflict,
  parseFleetRegister,
  toRejectedRowsCsv,
  validateFleetStagedRow,
} from '../services/fleetImportService.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: FLEET_IMPORT_MAX_FILE_SIZE, files: 1 } });
const uuid = z.string().uuid();
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).optional(),
  status: z.enum(['ready', 'needs_review', 'matched', 'unmatched', 'applied', 'rejected']).optional(),
});
const selectionSchema = z.object({ rowIds: z.array(uuid).min(1).max(1_000) });
const applySchema = selectionSchema.extend({ idempotencyKey: uuid, confirm: z.literal('APPLY FLEET CHANGES') });
const matchSchema = z.object({ rentalId: z.coerce.number().int().positive().nullable() });
const updateSchema = z.object({
  driverName: z.string().trim().max(200).nullable().optional(),
  sourceNotes: z.string().trim().max(2_000).nullable().optional(),
  weeklyRate: z.number().positive().max(10_000).optional(),
  acknowledgeWarnings: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required.');
const rejectSchema = selectionSchema.extend({ reason: z.string().trim().min(1).max(500) });

const adminEmail = (req: express.Request) => req.admin?.email || 'unknown-admin';
const sanitizeFilename = (filename: string) => {
  const base = path.basename(filename).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180).trim();
  return base || 'fleet-register';
};
const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });

const lockMutableFleetRow = async (client: import('pg').PoolClient, importId: string, rowId: string) => {
  const result = await client.query(
    `SELECT row.*, fleet_import.status AS import_status, fleet_import.snapshot_date AS import_snapshot_date
     FROM public.fleet_import_rows row
     JOIN public.fleet_imports fleet_import ON fleet_import.id=row.import_id
     WHERE row.id=$1 AND row.import_id=$2
     FOR UPDATE OF row, fleet_import`,
    [rowId, importId]
  );
  if (!result.rowCount) throw fail('Fleet import row not found.', 404);
  assertMutableFleetImportRow({ importStatus: result.rows[0].import_status, rowApplyStatus: result.rows[0].apply_status });
  return result.rows[0];
};

const revalidateFleetRow = async (
  client: import('pg').PoolClient,
  importId: string,
  rowId: string,
  actor?: string,
  audit = false
) => {
  const mutableRow = await lockMutableFleetRow(client, importId, rowId);
  const result = await client.query(
    `SELECT row.*, EXISTS (
         SELECT 1 FROM public.fleet_import_rows duplicate
         WHERE duplicate.import_id=row.import_id
           AND duplicate.id<>row.id
           AND duplicate.apply_status='pending'
           AND duplicate.vehicle_registration_normalized=row.vehicle_registration_normalized
       ) AS has_duplicate_registration
     FROM public.fleet_import_rows row
     WHERE row.id=$1 AND row.import_id=$2 FOR UPDATE OF row`,
    [rowId, importId]
  );
  if (!result.rowCount) throw fail('Fleet import row not found.', 404);
  const row = result.rows[0];
  const validation = validateFleetStagedRow(row, row.has_duplicate_registration, String(mutableRow.import_snapshot_date).slice(0, 10));
  const saved = await client.query(
    `UPDATE public.fleet_import_rows SET validation_errors=$3::jsonb,
      validation_warnings=$4::jsonb,validation_status=$5,updated_at=now()
     WHERE id=$1 AND import_id=$2 RETURNING *`,
    [rowId, importId, JSON.stringify(validation.validationErrors),
     JSON.stringify(validation.validationWarnings), validation.validationStatus]
  );
  if (audit && actor) {
    await client.query(`INSERT INTO public.admin_audit_events (action,actor,target_type,target_id,metadata)
      VALUES ('fleet_import.row_revalidated',$1,'fleet_import_row',$2,$3::jsonb)`,
      [actor, rowId, JSON.stringify({ importId, validationStatus: validation.validationStatus })]);
  }
  return saved.rows[0];
};

router.use(authenticateAdmin, requireTrustedAdminWriteOrigin);

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) throw fail('A fleet register file is required.');
  const file = req.file;
  const parsed = await Promise.race([
    parseFleetRegister({ buffer: file.buffer, filename: file.originalname, mimetype: file.mimetype }),
    new Promise<never>((_resolve, reject) => setTimeout(() => reject(fail('Fleet register parsing timed out.', 408)), 10_000)),
  ]);
  const actor = adminEmail(req);
  const originalFilename = sanitizeFilename(file.originalname);

  const result = await withPostgresTransaction(async (client) => {
    const duplicate = await client.query('SELECT id, status FROM public.fleet_imports WHERE file_checksum = $1', [parsed.checksum]);
    if (duplicate.rowCount) throw fail('This exact fleet register file has already been uploaded.', 409);
    const imported = await client.query(
      `INSERT INTO public.fleet_imports
        (original_filename, file_checksum, file_size, source_type, snapshot_date, status, total_rows, valid_rows, review_rows, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [originalFilename, parsed.checksum, file.size, parsed.sourceType, parsed.summary.snapshotDate,
       parsed.summary.reviewRows ? 'needs_review' : 'ready', parsed.summary.totalRows,
       parsed.summary.readyRows, parsed.summary.reviewRows, actor]
    );
    const importId = imported.rows[0].id;
    const rentals = await client.query(
      `SELECT id, weekly_price, updated_at,
        upper(regexp_replace(btrim(vehicle_registration), '\\s+', '', 'g')) normalized_registration
       FROM public.rentals
       WHERE upper(regexp_replace(btrim(vehicle_registration), '\\s+', '', 'g'))=ANY($1::text[])
       ORDER BY CASE WHEN status='Active' THEN 0 ELSE 1 END, updated_at DESC`,
      [parsed.rows.map((row) => row.vehicleRegistrationNormalized)]
    );
    const rentalsByRegistration = new Map<string, Array<Record<string, unknown>>>();
    for (const rental of rentals.rows) {
      const registration = String(rental.normalized_registration);
      rentalsByRegistration.set(registration, [
        ...(rentalsByRegistration.get(registration) || []),
        rental,
      ]);
    }
    const stagedRows = parsed.rows.map((row) => {
      const matches = rentalsByRegistration.get(row.vehicleRegistrationNormalized) || [];
      const unambiguous = matches.length === 1 ? matches[0] : null;
      const warnings = [...row.validationWarnings];
      if (matches.length > 1) warnings.push('Multiple rentals share this registration; choose the exact record.');
      return {
        source_row_number: row.sourceRowNumber, driver_name_original: row.driverNameOriginal,
        driver_name_normalized: row.driverNameNormalized, vehicle_registration_original: row.vehicleRegistrationOriginal,
        vehicle_registration_normalized: row.vehicleRegistrationNormalized, make_original: row.makeOriginal,
        make_normalized: row.makeNormalized, model_original: row.modelOriginal, model_normalized: row.modelNormalized,
        weekly_rate: row.weeklyRate, snapshot_date: row.snapshotDate, source_notes: row.sourceNotes,
        validation_status: row.validationErrors.length || warnings.length ? 'needs_review' : 'ready',
        validation_errors: row.validationErrors, validation_warnings: warnings, matched_rental_id: unambiguous?.id || null,
        matched_rental_updated_at: unambiguous?.updated_at || null,
        proposed_changes: unambiguous ? { weekly_price: { existing: Number(unambiguous.weekly_price), proposed: row.weeklyRate } } : {},
      };
    });
    await client.query(
      `INSERT INTO public.fleet_import_rows
        (import_id,source_row_number,driver_name_original,driver_name_normalized,vehicle_registration_original,
         vehicle_registration_normalized,make_original,make_normalized,model_original,model_normalized,weekly_rate,
         snapshot_date,source_notes,validation_status,validation_errors,validation_warnings,matched_rental_id,
         matched_rental_updated_at,proposed_changes)
       SELECT $1,row.source_row_number,row.driver_name_original,row.driver_name_normalized,row.vehicle_registration_original,
         row.vehicle_registration_normalized,row.make_original,row.make_normalized,row.model_original,row.model_normalized,
         row.weekly_rate,row.snapshot_date,row.source_notes,row.validation_status,row.validation_errors,row.validation_warnings,
         row.matched_rental_id,row.matched_rental_updated_at,row.proposed_changes
       FROM jsonb_to_recordset($2::jsonb) AS row(
         source_row_number integer,driver_name_original text,driver_name_normalized text,
         vehicle_registration_original text,vehicle_registration_normalized text,make_original text,make_normalized text,
         model_original text,model_normalized text,weekly_rate numeric,snapshot_date date,source_notes text,
         validation_status text,validation_errors jsonb,validation_warnings jsonb,matched_rental_id bigint,
         matched_rental_updated_at timestamptz,proposed_changes jsonb)`,
      [importId, JSON.stringify(stagedRows)]
    );
    await client.query(
      `INSERT INTO public.admin_audit_events (action, actor, target_type, target_id, metadata)
       VALUES ('fleet_import.uploaded', $1, 'fleet_import', $2, $3::jsonb)`,
      [actor, importId, JSON.stringify({ filename: originalFilename, checksum: parsed.checksum, rows: parsed.summary.totalRows })]
    );
    return { ...imported.rows[0], summary: parsed.summary };
  });
  res.status(201).json(result);
});

router.get('/', async (req, res) => {
  const query = listSchema.pick({ page: true, pageSize: true, search: true }).parse(req.query);
  const offset = (query.page - 1) * query.pageSize;
  const result = await withPostgresTransaction(async (client) => client.query(
    `SELECT *, count(*) OVER()::integer AS filtered_count FROM public.fleet_imports
     WHERE ($1::text IS NULL OR original_filename ILIKE '%' || $1 || '%')
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [query.search || null, query.pageSize, offset]
  ));
  res.json({ items: result.rows.map(({ filtered_count: _count, ...row }) => row), page: query.page,
    pageSize: query.pageSize, total: result.rows[0]?.filtered_count || 0 });
});

router.get('/:id', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const result = await withPostgresTransaction(async (client) => client.query(
    `SELECT import.*,
       coalesce(sum(row.weekly_rate),0)::numeric AS total_weekly_rate,
       count(*) FILTER (WHERE row.matched_rental_id IS NOT NULL)::integer AS matched_rows,
       count(*) FILTER (WHERE row.matched_rental_id IS NULL)::integer AS unmatched_rows,
       count(*) FILTER (WHERE row.weekly_rate > coalesce((row.proposed_changes->'weekly_price'->>'existing')::numeric,row.weekly_rate))::integer AS proposed_increases,
       count(*) FILTER (WHERE row.weekly_rate < coalesce((row.proposed_changes->'weekly_price'->>'existing')::numeric,row.weekly_rate))::integer AS proposed_decreases
     FROM public.fleet_imports import LEFT JOIN public.fleet_import_rows row ON row.import_id=import.id
     WHERE import.id=$1 GROUP BY import.id`, [id]
  ));
  if (!result.rowCount) throw fail('Fleet import not found.', 404);
  res.json(result.rows[0]);
});

router.get('/:id/rows', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const query = listSchema.parse(req.query);
  const clauses = ['row.import_id=$1'];
  const values: unknown[] = [id];
  if (query.search) {
    values.push(query.search);
    clauses.push(`(row.driver_name_original ILIKE '%' || $${values.length} || '%' OR row.vehicle_registration_original ILIKE '%' || $${values.length} || '%')`);
  }
  if (query.status === 'ready' || query.status === 'needs_review') { values.push(query.status); clauses.push(`row.validation_status=$${values.length}`); }
  if (query.status === 'matched') clauses.push('row.matched_rental_id IS NOT NULL');
  if (query.status === 'unmatched') clauses.push('row.matched_rental_id IS NULL');
  if (query.status === 'applied' || query.status === 'rejected') { values.push(query.status); clauses.push(`row.apply_status=$${values.length}`); }
  values.push(query.pageSize, (query.page - 1) * query.pageSize);
  const result = await withPostgresTransaction(async (client) => client.query(
    `SELECT row.*, rental.vehicle_registration AS existing_registration, rental.weekly_price AS existing_weekly_rate,
       count(*) OVER()::integer AS filtered_count
     FROM public.fleet_import_rows row LEFT JOIN public.rentals rental ON rental.id=row.matched_rental_id
     WHERE ${clauses.join(' AND ')} ORDER BY row.source_row_number LIMIT $${values.length - 1} OFFSET $${values.length}`, values
  ));
  res.json({ items: result.rows.map(({ filtered_count: _count, ...row }) => row), page: query.page,
    pageSize: query.pageSize, total: result.rows[0]?.filtered_count || 0 });
});

router.get('/:id/audit', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const query = listSchema.pick({ page: true, pageSize: true }).parse(req.query);
  const result = await withPostgresTransaction(async (client) => client.query(
    `SELECT *,count(*) OVER()::integer filtered_count FROM public.admin_audit_events
     WHERE (target_type='fleet_import' AND target_id=$1)
        OR (target_type='fleet_import_row' AND metadata->>'importId'=$1)
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [id, query.pageSize, (query.page - 1) * query.pageSize]
  ));
  res.json({ items: result.rows.map(({ filtered_count: _count, ...row }) => row), page: query.page,
    pageSize: query.pageSize, total: result.rows[0]?.filtered_count || 0 });
});

router.post('/:id/rows/:rowId/revalidate', async (req, res) => {
  const importId = uuid.parse(req.params.id); const rowId = uuid.parse(req.params.rowId);
  const actor = adminEmail(req);
  const updated = await withPostgresTransaction((client) => revalidateFleetRow(client, importId, rowId, actor, true));
  res.json(updated);
});

router.patch('/:id/rows/:rowId', async (req, res) => {
  const importId = uuid.parse(req.params.id); const rowId = uuid.parse(req.params.rowId);
  const body = updateSchema.parse(req.body); const actor = adminEmail(req);
  const result = await withPostgresTransaction(async (client) => {
    const currentRow = await lockMutableFleetRow(client, importId, rowId);
    const driverSupplied = Object.hasOwn(body, 'driverName');
    const notesSupplied = Object.hasOwn(body, 'sourceNotes');
    const rateSupplied = Object.hasOwn(body, 'weeklyRate');
    const driverName = driverSupplied ? normalizeFleetDriverName(body.driverName ?? null) : null;
    await client.query(
      `UPDATE public.fleet_import_rows SET
       driver_name_original=CASE WHEN $3 THEN $4 ELSE driver_name_original END,
       driver_name_normalized=CASE WHEN $3 THEN $5 ELSE driver_name_normalized END,
       source_notes=CASE WHEN $6 THEN $7 ELSE source_notes END,
       weekly_rate=CASE WHEN $8 THEN $9 ELSE weekly_rate END,
       review_acknowledged_at=CASE WHEN $3 OR $6 OR $8 THEN NULL ELSE review_acknowledged_at END,
       review_acknowledged_by=CASE WHEN $3 OR $6 OR $8 THEN NULL ELSE review_acknowledged_by END,
       updated_at=now()
       WHERE id=$1 AND import_id=$2 RETURNING *`,
      [rowId, importId, driverSupplied, driverName, driverName, notesSupplied,
       body.sourceNotes ?? null, rateSupplied, body.weeklyRate ?? null]
    );
    let updated = await revalidateFleetRow(client, importId, rowId);
    if (body.acknowledgeWarnings === true) {
      if ((updated.validation_errors as string[]).length) {
        throw fail('Rows with validation errors cannot be acknowledged.', 409);
      }
      const acknowledged = await client.query(
        `UPDATE public.fleet_import_rows SET review_acknowledged_at=now(),review_acknowledged_by=$3,
         validation_status='ready',updated_at=now() WHERE id=$1 AND import_id=$2 RETURNING *`,
        [rowId, importId, actor]
      );
      updated = acknowledged.rows[0];
      await client.query(`INSERT INTO public.admin_audit_events (action,actor,target_type,target_id,metadata)
        VALUES ('fleet_import.warning_acknowledged',$1,'fleet_import_row',$2,$3::jsonb)`,
        [actor, rowId, JSON.stringify({ importId })]);
    }
    const changedFields = [driverSupplied && 'driverName', notesSupplied && 'sourceNotes', rateSupplied && 'weeklyRate'].filter(Boolean);
    if (changedFields.length) {
      await client.query(`INSERT INTO public.admin_audit_events (action,actor,target_type,target_id,metadata)
        VALUES ('fleet_import.row_edited',$1,'fleet_import_row',$2,$3::jsonb)`,
        [actor, rowId, JSON.stringify({ importId, changedFields, previousWeeklyRate: Number(currentRow.weekly_rate), proposedWeeklyRate: Number(updated.weekly_rate) })]);
    }
    await client.query(`UPDATE public.fleet_imports SET valid_rows=(SELECT count(*) FROM public.fleet_import_rows WHERE import_id=$1 AND validation_status='ready'),
      review_rows=(SELECT count(*) FROM public.fleet_import_rows WHERE import_id=$1 AND validation_status='needs_review'),updated_at=now() WHERE id=$1`, [importId]);
    return updated;
  });
  res.json(result);
});

router.put('/:id/rows/:rowId/match', async (req, res) => {
  const importId = uuid.parse(req.params.id); const rowId = uuid.parse(req.params.rowId); const body = matchSchema.parse(req.body);
  const actor = adminEmail(req);
  const result = await withPostgresTransaction(async (client) => {
    const mutableRow = await lockMutableFleetRow(client, importId, rowId);
    let rental = null;
    if (body.rentalId) {
      const found = await client.query('SELECT id, vehicle_registration, weekly_price, updated_at FROM public.rentals WHERE id=$1', [body.rentalId]);
      if (!found.rowCount) throw fail('Rental not found.', 404);
      rental = found.rows[0];
      assertFleetRentalRegistrationMatch(
        mutableRow.vehicle_registration_original,
        rental.vehicle_registration
      );
    }
    const updated = await client.query(
      `UPDATE public.fleet_import_rows SET matched_rental_id=$3, matched_rental_updated_at=$4,
       proposed_changes=$5::jsonb, updated_at=now() WHERE id=$1 AND import_id=$2 RETURNING *`,
      [rowId, importId, rental?.id || null, rental?.updated_at || null,
       JSON.stringify(rental ? { weekly_price: { existing: Number(rental.weekly_price), proposed: Number(mutableRow.weekly_rate) } } : {})]
    );
    await client.query(`INSERT INTO public.admin_audit_events (action,actor,target_type,target_id,metadata)
      VALUES ($1,$2,'fleet_import_row',$3,$4::jsonb)`,
      [rental ? 'fleet_import.row_matched' : 'fleet_import.row_unmatched', actor, rowId,
       JSON.stringify({ importId, rentalId: rental?.id || null })]);
    return updated.rows[0];
  });
  res.json(result);
});

const buildDryRun = async (client: import('pg').PoolClient, importId: string, rowIds: string[]) => {
  const imports = await client.query('SELECT * FROM public.fleet_imports WHERE id=$1 FOR UPDATE', [importId]);
  if (!imports.rowCount) throw fail('Fleet import not found.', 404);
  if (['applied', 'cancelled', 'failed'].includes(imports.rows[0].status)) throw fail('This import can no longer be applied.', 409);
  const rows = await client.query(
    `SELECT row.*, rental.weekly_price AS authoritative_weekly_rate, rental.updated_at AS authoritative_updated_at,
       rental.vehicle_registration AS authoritative_registration
     FROM public.fleet_import_rows row LEFT JOIN public.rentals rental ON rental.id=row.matched_rental_id
     WHERE row.import_id=$1 AND row.id=ANY($2::uuid[]) FOR UPDATE OF row`, [importId, rowIds]
  );
  if (rows.rowCount !== rowIds.length) throw fail('One or more selected rows do not belong to this import.', 400);
  return rows.rows.map((row) => {
    let conflict: string | null = null;
    if (row.apply_status !== 'pending') conflict = `Row is already ${row.apply_status}.`;
    else if (getFleetDryRunValidationConflict(row.validation_status)) conflict = getFleetDryRunValidationConflict(row.validation_status);
    else if (!row.matched_rental_id || row.authoritative_weekly_rate == null) conflict = 'Row is not matched to a rental.';
    else if (normalizeFleetRegistration(row.vehicle_registration_original) !== normalizeFleetRegistration(row.authoritative_registration)) conflict = 'Matched rental registration no longer matches the imported registration.';
    else if (new Date(row.matched_rental_updated_at).getTime() !== new Date(row.authoritative_updated_at).getTime()) conflict = 'Matched rental changed after preview.';
    return { rowId: row.id, sourceRowNumber: row.source_row_number, rentalId: row.matched_rental_id,
      registration: row.authoritative_registration, existingWeeklyRate: Number(row.authoritative_weekly_rate),
      proposedWeeklyRate: Number(row.weekly_rate), difference: Number(row.weekly_rate) - Number(row.authoritative_weekly_rate),
      snapshotDate: row.snapshot_date instanceof Date
        ? row.snapshot_date.toISOString().slice(0, 10)
        : String(row.snapshot_date).slice(0, 10),
      conflict };
  });
};

router.post('/:id/dry-run', async (req, res) => {
  const id = uuid.parse(req.params.id); const { rowIds } = selectionSchema.parse(req.body);
  const rows = await withPostgresTransaction((client) => buildDryRun(client, id, rowIds));
  res.json({ canApply: rows.every((row) => !row.conflict), rows });
});

router.post('/:id/apply', async (req, res) => {
  const importId = uuid.parse(req.params.id); const body = applySchema.parse(req.body); const actor = adminEmail(req);
  const result = await withPostgresTransaction(async (client) => {
    const existing = await client.query('SELECT result,status FROM public.fleet_import_apply_operations WHERE import_id=$1 AND idempotency_key=$2 FOR UPDATE', [importId, body.idempotencyKey]);
    if (existing.rowCount) return existing.rows[0].result;
    await client.query(`INSERT INTO public.fleet_import_apply_operations
      (import_id,idempotency_key,requested_by,selected_row_ids,status) VALUES ($1,$2,$3,$4,'processing')`,
      [importId, body.idempotencyKey, actor, body.rowIds]);
    const preview = await buildDryRun(client, importId, body.rowIds);
    const conflicts = preview.filter((row) => row.conflict);
    if (conflicts.length) throw fail('Selected fleet rows have unresolved conflicts. Run dry-run again.', 409);
    for (const row of preview) {
      await client.query('UPDATE public.rentals SET weekly_price=$1, updated_at=now() WHERE id=$2', [row.proposedWeeklyRate, row.rentalId]);
      await client.query(`UPDATE public.fleet_import_rows SET apply_status='applied',applied_at=now(),applied_by=$1,updated_at=now() WHERE id=$2`, [actor, row.rowId]);
    }
    const counts = await client.query(`SELECT count(*) FILTER (WHERE apply_status='applied')::integer applied,
      count(*) FILTER (WHERE apply_status='rejected')::integer rejected,
      count(*) FILTER (WHERE apply_status='pending')::integer pending FROM public.fleet_import_rows WHERE import_id=$1`, [importId]);
    const finalStatus = counts.rows[0].pending === 0 ? 'applied' : 'partially_applied';
    const response = { importId, status: finalStatus, appliedRows: preview };
    await client.query(`UPDATE public.fleet_imports SET status=$2,applied_rows=$3,rejected_rows=$4,
      completed_at=CASE WHEN $5=0 THEN now() ELSE NULL END,updated_at=now() WHERE id=$1`,
      [importId, finalStatus, counts.rows[0].applied, counts.rows[0].rejected, counts.rows[0].pending]);
    await client.query(`UPDATE public.fleet_import_apply_operations SET status='applied',result=$3::jsonb,completed_at=now()
      WHERE import_id=$1 AND idempotency_key=$2`, [importId, body.idempotencyKey, JSON.stringify(response)]);
    await client.query(`INSERT INTO public.admin_audit_events (action,actor,target_type,target_id,metadata)
      VALUES ('fleet_import.rows_applied',$1,'fleet_import',$2,$3::jsonb)`,
      [actor, importId, JSON.stringify(buildFleetApplyAuditMetadata(preview))]);
    return response;
  });
  res.json(result);
});

router.post('/:id/reject', async (req, res) => {
  const importId = uuid.parse(req.params.id); const body = rejectSchema.parse(req.body); const actor = adminEmail(req);
  const result = await withPostgresTransaction(async (client) => {
    const lockedRows = [];
    for (const rowId of body.rowIds) lockedRows.push(await lockMutableFleetRow(client, importId, rowId));
    const updated = await client.query(`UPDATE public.fleet_import_rows SET apply_status='rejected',rejection_reason=$3,updated_at=now()
      WHERE import_id=$1 AND id=ANY($2::uuid[]) AND apply_status='pending' RETURNING id`, [importId, body.rowIds, body.reason]);
    if (updated.rowCount !== body.rowIds.length) throw fail('One or more selected rows cannot be rejected.', 409);
    const affectedRegistrations = [...new Set(lockedRows.map((row) => row.vehicle_registration_normalized))];
    const remaining = await client.query(`SELECT id FROM public.fleet_import_rows
      WHERE import_id=$1 AND apply_status='pending' AND vehicle_registration_normalized=ANY($2::text[])`,
      [importId, affectedRegistrations]);
    for (const row of remaining.rows) await revalidateFleetRow(client, importId, row.id);
    await client.query(`UPDATE public.fleet_imports SET rejected_rows=(SELECT count(*) FROM public.fleet_import_rows WHERE import_id=$1 AND apply_status='rejected'),updated_at=now() WHERE id=$1`, [importId]);
    await client.query(`INSERT INTO public.admin_audit_events (action,actor,target_type,target_id,metadata)
      VALUES ('fleet_import.rows_rejected',$1,'fleet_import',$2,$3::jsonb)`, [actor, importId, JSON.stringify({ rowIds: body.rowIds, reason: body.reason })]);
    return updated.rows;
  });
  res.json({ rejected: result.length });
});

router.post('/:id/cancel', async (req, res) => {
  const id = uuid.parse(req.params.id); const actor = adminEmail(req);
  await withPostgresTransaction(async (client) => {
    const updated = await client.query(`UPDATE public.fleet_imports SET status='cancelled',completed_at=now(),updated_at=now()
      WHERE id=$1 AND applied_rows=0 AND status NOT IN ('cancelled','applied') RETURNING id`, [id]);
    if (!updated.rowCount) throw fail('Only unapplied active imports can be cancelled.', 409);
    await client.query(`INSERT INTO public.admin_audit_events (action,actor,target_type,target_id,metadata)
      VALUES ('fleet_import.cancelled',$1,'fleet_import',$2,'{}')`, [actor, id]);
  });
  res.json({ success: true });
});

router.get('/:id/rejected.csv', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const result = await withPostgresTransaction(async (client) => client.query(
    `SELECT source_row_number,driver_name_original driver,vehicle_registration_original registration,
      make_original make,model_original model,weekly_rate,snapshot_date,source_notes notes,
      validation_errors::text validation_errors,validation_warnings::text validation_warnings,apply_status
     FROM public.fleet_import_rows WHERE import_id=$1 AND (apply_status='rejected' OR jsonb_array_length(validation_errors)>0)
     ORDER BY source_row_number`, [id]
  ));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="fleet-import-${id}-rejected.csv"`);
  res.send(toRejectedRowsCsv(result.rows));
});

export default router;
