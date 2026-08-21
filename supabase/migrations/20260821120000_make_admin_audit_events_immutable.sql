-- Preflight:
--   1. Confirm private.is_admin() and public.admin_audit_events exist.
--   2. Confirm application servers write audit events with service_role.
-- This migration is additive and does not rewrite existing audit rows.

BEGIN;

-- Audit history is server-authored. Allowing an authenticated browser to
-- insert its own event lets a compromised admin session fabricate the trail.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON TABLE public.admin_audit_events
  FROM anon, authenticated;
REVOKE ALL PRIVILEGES
  ON TABLE public.admin_audit_events
  FROM service_role;
GRANT SELECT, INSERT
  ON TABLE public.admin_audit_events
  TO service_role;

DROP POLICY IF EXISTS admin_audit_insert ON public.admin_audit_events;

CREATE OR REPLACE FUNCTION private.prevent_admin_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_events is append-only'
    USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_admin_audit_event_mutation() FROM PUBLIC;

DROP TRIGGER IF EXISTS admin_audit_events_prevent_mutation
  ON public.admin_audit_events;
CREATE TRIGGER admin_audit_events_prevent_mutation
  BEFORE UPDATE OR DELETE ON public.admin_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_admin_audit_event_mutation();

DROP TRIGGER IF EXISTS admin_audit_events_prevent_truncate
  ON public.admin_audit_events;
CREATE TRIGGER admin_audit_events_prevent_truncate
  BEFORE TRUNCATE ON public.admin_audit_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.prevent_admin_audit_event_mutation();

COMMIT;

-- Recovery (manual, only if an audited emergency procedure requires it):
--   DROP TRIGGER admin_audit_events_prevent_mutation ON public.admin_audit_events;
--   DROP TRIGGER admin_audit_events_prevent_truncate ON public.admin_audit_events;
--   DROP FUNCTION private.prevent_admin_audit_event_mutation();
-- Do not restore authenticated INSERT; audit events must remain server-authored.
