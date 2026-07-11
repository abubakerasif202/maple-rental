import { db } from './db/index.js';

export const recordAdminAuditEvent = async ({
  action,
  actor,
  metadata = {},
  targetId = null,
  targetType,
}: {
  action: string;
  actor?: string | null;
  metadata?: Record<string, unknown>;
  targetId?: string | number | null;
  targetType: string;
}) => {
  const { error } = await db.from('admin_audit_events').insert([{
    action,
    actor: actor || null,
    metadata,
    target_id: targetId == null ? null : String(targetId),
    target_type: targetType,
  }]);
  if (error) throw error;
};
