import { z } from 'zod';

import api from './api';
import type { AdminDatasetRequest } from './api';

export type FleetImportStatus =
  | 'uploaded' | 'parsing' | 'needs_review' | 'ready' | 'applying'
  | 'partially_applied' | 'applied' | 'failed' | 'cancelled';

export interface FleetImportSummary {
  id: string;
  original_filename: string;
  snapshot_date: string;
  status: FleetImportStatus;
  total_rows: number;
  valid_rows: number;
  review_rows: number;
  applied_rows: number;
  rejected_rows: number;
  uploaded_by: string;
  created_at: string;
  total_weekly_rate?: number | string;
  matched_rows?: number;
  unmatched_rows?: number;
  proposed_increases?: number;
  proposed_decreases?: number;
}

export interface FleetImportRow {
  id: string;
  source_row_number: number;
  driver_name_original: string | null;
  vehicle_registration_original: string;
  make_original: string;
  model_original: string;
  weekly_rate: number | string;
  snapshot_date: string;
  source_notes: string | null;
  validation_status: 'ready' | 'needs_review';
  validation_errors: string[];
  validation_warnings: string[];
  matched_rental_id: number | null;
  existing_registration: string | null;
  existing_weekly_rate: number | string | null;
  apply_status: 'pending' | 'applied' | 'rejected' | 'conflict';
}

export interface FleetImportAuditEvent {
  id: string | number;
  action: string;
  actor: string | null;
  target_type: string;
  target_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface FleetPage<T> { items: T[]; page: number; pageSize: number; total: number }

const fleetImportSummarySchema = z.object({
  id: z.string().uuid(), original_filename: z.string(), snapshot_date: z.string(),
  status: z.enum(['uploaded', 'parsing', 'needs_review', 'ready', 'applying', 'partially_applied', 'applied', 'failed', 'cancelled']),
  total_rows: z.number(), valid_rows: z.number(), review_rows: z.number(), applied_rows: z.number(),
  rejected_rows: z.number(), uploaded_by: z.string(), created_at: z.string(),
  total_weekly_rate: z.union([z.number(), z.string()]).optional(), matched_rows: z.number().optional(),
  unmatched_rows: z.number().optional(), proposed_increases: z.number().optional(), proposed_decreases: z.number().optional(),
}).passthrough();
const positiveSafeIntegerSchema = z.union([
  z.number(),
  z.string().regex(/^\d+$/),
]).transform(Number).pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
const fleetImportRowSchema = z.object({
  id: z.string().uuid(), source_row_number: z.number(), driver_name_original: z.string().nullable(),
  vehicle_registration_original: z.string(), make_original: z.string(), model_original: z.string(),
  weekly_rate: z.union([z.number(), z.string()]), snapshot_date: z.string(), source_notes: z.string().nullable(),
  validation_status: z.enum(['ready', 'needs_review']), validation_errors: z.array(z.string()),
  validation_warnings: z.array(z.string()), matched_rental_id: positiveSafeIntegerSchema.nullable(),
  existing_registration: z.string().nullable(), existing_weekly_rate: z.union([z.number(), z.string()]).nullable(),
  apply_status: z.enum(['pending', 'applied', 'rejected', 'conflict']),
}).passthrough();
const fleetPageSchema = <T extends z.ZodType>(item: T) => z.object({
  items: z.array(item), page: z.number(), pageSize: z.number(), total: z.number(),
});

export const uploadFleetImport = async (file: File): Promise<FleetImportSummary> => {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post('/admin/fleet-imports', form);
  return fleetImportSummarySchema.parse(data);
};

export const fetchFleetImports = async (params: AdminDatasetRequest, signal?: AbortSignal): Promise<FleetPage<FleetImportSummary>> => {
  const { data } = await api.get('/admin/fleet-imports', { params, signal });
  return fleetPageSchema(fleetImportSummarySchema).parse(data);
};

export const fetchFleetImport = async (id: string, signal?: AbortSignal): Promise<FleetImportSummary> => {
  const { data } = await api.get(`/admin/fleet-imports/${id}`, { signal });
  return fleetImportSummarySchema.parse(data);
};

export const fetchFleetImportRows = async (id: string, params: AdminDatasetRequest & { status?: string }, signal?: AbortSignal): Promise<FleetPage<FleetImportRow>> => {
  const { data } = await api.get(`/admin/fleet-imports/${id}/rows`, { params, signal });
  return fleetPageSchema(fleetImportRowSchema).parse(data);
};

export const updateFleetImportRow = async (importId: string, rowId: string, payload: { acknowledgeWarnings?: boolean; driverName?: string | null; sourceNotes?: string | null; weeklyRate?: number }) => {
  const { data } = await api.patch(`/admin/fleet-imports/${importId}/rows/${rowId}`, payload);
  return fleetImportRowSchema.parse(data);
};

export const matchFleetImportRow = async (importId: string, rowId: string, rentalId: number | null) => {
  const { data } = await api.put(`/admin/fleet-imports/${importId}/rows/${rowId}/match`, { rentalId });
  return fleetImportRowSchema.parse(data);
};

export const revalidateFleetImportRow = async (importId: string, rowId: string) => {
  const { data } = await api.post(`/admin/fleet-imports/${importId}/rows/${rowId}/revalidate`);
  return fleetImportRowSchema.parse(data);
};

export const fetchFleetImportAudit = async (id: string, page: number, signal?: AbortSignal): Promise<FleetPage<FleetImportAuditEvent>> => {
  const { data } = await api.get(`/admin/fleet-imports/${id}/audit`, { params: { page, pageSize: 10 }, signal });
  return data;
};

export const dryRunFleetImport = async (id: string, rowIds: string[]) => {
  const { data } = await api.post(`/admin/fleet-imports/${id}/dry-run`, { rowIds });
  return z.object({ canApply: z.boolean(), rows: z.array(z.object({ conflict: z.string().nullable() }).passthrough()) }).parse(data);
};

export const applyFleetImport = async (id: string, rowIds: string[], idempotencyKey: string) => {
  const { data } = await api.post(`/admin/fleet-imports/${id}/apply`, {
    rowIds, idempotencyKey, confirm: 'APPLY FLEET CHANGES',
  });
  return z.object({ importId: z.string().uuid(), status: z.enum(['partially_applied', 'applied']), appliedRows: z.array(z.record(z.string(), z.unknown())) }).passthrough().parse(data);
};

export const rejectFleetImportRows = async (id: string, rowIds: string[], reason: string) => {
  const { data } = await api.post(`/admin/fleet-imports/${id}/reject`, { rowIds, reason });
  return z.object({ rejected: z.number() }).parse(data);
};

export const cancelFleetImport = async (id: string) => {
  const { data } = await api.post(`/admin/fleet-imports/${id}/cancel`);
  return z.object({ success: z.boolean() }).parse(data);
};

export const downloadFleetImportRejectedRows = async (id: string) => {
  const { data } = await api.get(`/admin/fleet-imports/${id}/rejected.csv`, { responseType: 'blob' });
  return z.instanceof(Blob).parse(data);
};
