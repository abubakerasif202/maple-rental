-- Public applications are submitted through the Express API, which performs
-- validation, upload inspection, duplicate checks, and rate limiting.
BEGIN;

DROP POLICY IF EXISTS public_submit_application ON public.applications;
REVOKE INSERT ON TABLE public.applications FROM anon;

COMMIT;
