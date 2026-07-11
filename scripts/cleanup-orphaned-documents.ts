import './load-env.js';
import { pathToFileURL } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const APPLICATIONS_BUCKET = 'applications';
const PAGE_SIZE = 1000;
const DELETE_BATCH_SIZE = 100;
const DEFAULT_GRACE_DAYS = 30;
const DOCUMENT_FIELDS = [
  'license_photo',
  'licensePhoto',
  'license_back_photo',
  'licenseBackPhoto',
  'uber_screenshot',
  'uberScreenshot',
  'passport_or_uber_profile_screenshot',
  'passportOrUberProfileScreenshot',
] as const;

type StorageFile = {
  created_at?: string | null;
  name: string;
  updated_at?: string | null;
};

export const extractStoragePath = (urlOrPath: unknown) => {
  if (typeof urlOrPath !== 'string' || !urlOrPath.trim()) return null;
  const value = urlOrPath.trim();

  try {
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      const marker = `/applications/`;
      const markerIndex = url.pathname.indexOf(marker);
      return decodeURIComponent(
        markerIndex >= 0 ? url.pathname.slice(markerIndex + marker.length) : url.pathname.split('/').pop() || '',
      );
    }
  } catch {
    return value;
  }

  return value.replace(/^\/+/, '');
};

export const collectReferencedPaths = (applications: Array<Record<string, unknown>>) => {
  const referencedPaths = new Set<string>();
  for (const application of applications) {
    for (const field of DOCUMENT_FIELDS) {
      const path = extractStoragePath(application[field]);
      if (path) referencedPaths.add(path);
    }
  }
  return referencedPaths;
};

export const selectEligibleOrphans = ({
  files,
  heldPaths,
  now = new Date(),
  referencedPaths,
  graceDays = DEFAULT_GRACE_DAYS,
}: {
  files: StorageFile[];
  heldPaths: Set<string>;
  now?: Date;
  referencedPaths: Set<string>;
  graceDays?: number;
}) => {
  const cutoff = now.getTime() - graceDays * 24 * 60 * 60 * 1000;
  return files
    .filter((file) => file.name !== '.emptyFolderPlaceholder')
    .filter((file) => !referencedPaths.has(file.name) && !heldPaths.has(file.name))
    .filter((file) => {
      const timestamp = file.updated_at || file.created_at;
      if (!timestamp) return false;
      const parsed = Date.parse(timestamp);
      return Number.isFinite(parsed) && parsed <= cutoff;
    })
    .map((file) => file.name);
};

const fetchAllApplications = async (supabase: SupabaseClient) => {
  const rows: Array<Record<string, unknown>> = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('applications')
      .select('*')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to fetch applications: ${error.message}`);
    rows.push(...((data || []) as Array<Record<string, unknown>>));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
};

const fetchAllStorageFiles = async (supabase: SupabaseClient) => {
  const files: StorageFile[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.storage
      .from(APPLICATIONS_BUCKET)
      .list('', { limit: PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`Failed to list application documents: ${error.message}`);
    files.push(...((data || []) as StorageFile[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return files;
};

const fetchActiveHolds = async (supabase: SupabaseClient) => {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('document_retention_holds')
    .select('storage_path, held_until, released_at')
    .is('released_at', null);
  if (error) throw new Error(`Document retention holds are unavailable: ${error.message}`);

  return new Set(
    (data || [])
      .filter((hold) => !hold.held_until || String(hold.held_until) > nowIso)
      .map((hold) => String(hold.storage_path || '').trim())
      .filter(Boolean),
  );
};

const writeAudit = async (
  supabase: SupabaseClient,
  action: string,
  metadata: Record<string, unknown>,
) => {
  const { error } = await supabase.from('admin_audit_events').insert([{
    action,
    actor: 'document-cleanup-script',
    target_type: 'storage_bucket',
    target_id: APPLICATIONS_BUCKET,
    metadata,
  }]);
  if (error) throw new Error(`Failed to write cleanup audit event: ${error.message}`);
};

export const runCleanup = async ({ apply = false, graceDays = DEFAULT_GRACE_DAYS } = {}) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }
  if (!Number.isInteger(graceDays) || graceDays < DEFAULT_GRACE_DAYS) {
    throw new Error(`Grace period must be at least ${DEFAULT_GRACE_DAYS} days.`);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const [files, applications, heldPaths] = await Promise.all([
    fetchAllStorageFiles(supabase),
    fetchAllApplications(supabase),
    fetchActiveHolds(supabase),
  ]);
  const referencedPaths = collectReferencedPaths(applications);
  const orphanedFiles = selectEligibleOrphans({ files, heldPaths, referencedPaths, graceDays });
  const summary = {
    apply,
    filesScanned: files.length,
    graceDays,
    heldFiles: heldPaths.size,
    orphanedFiles,
    referencedFiles: referencedPaths.size,
  };

  console.log(JSON.stringify(summary, null, 2));
  await writeAudit(supabase, apply ? 'document_cleanup_apply_started' : 'document_cleanup_dry_run', {
    ...summary,
    orphanedFiles: orphanedFiles.length,
  });

  if (!apply || orphanedFiles.length === 0) {
    console.log(apply ? 'No eligible orphaned files found.' : 'Dry run only. Re-run with --apply to delete eligible files.');
    return summary;
  }

  let deletedCount = 0;
  for (let index = 0; index < orphanedFiles.length; index += DELETE_BATCH_SIZE) {
    const batch = orphanedFiles.slice(index, index + DELETE_BATCH_SIZE);
    const { data, error } = await supabase.storage.from(APPLICATIONS_BUCKET).remove(batch);
    if (error) throw new Error(`Failed to delete document batch: ${error.message}`);
    deletedCount += data?.length || 0;
  }

  await writeAudit(supabase, 'document_cleanup_applied', {
    deletedCount,
    graceDays,
    requestedCount: orphanedFiles.length,
  });
  console.log(`Deleted ${deletedCount} eligible orphaned files.`);
  return { ...summary, deletedCount };
};

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectRun) {
  const apply = process.argv.includes('--apply');
  const graceArgument = process.argv.find((argument) => argument.startsWith('--grace-days='));
  const graceDays = graceArgument ? Number(graceArgument.split('=')[1]) : DEFAULT_GRACE_DAYS;
  runCleanup({ apply, graceDays }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
