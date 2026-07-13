-- Prevent older or concurrently delivered Stripe lifecycle events from
-- regressing the operational rental status.
BEGIN;

ALTER TABLE public.rentals
  ADD COLUMN IF NOT EXISTS stripe_status_event_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_status_event_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_status_event_terminal BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_rentals_stripe_status_event_watermark
  ON public.rentals (stripe_subscription_id, stripe_status_event_created_at DESC)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.apply_stripe_rental_status_event(
  p_subscription_id TEXT,
  p_status TEXT,
  p_end_date DATE,
  p_event_created_at TIMESTAMPTZ,
  p_event_id TEXT,
  p_terminal BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (matched BOOLEAN, applied BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  IF NULLIF(btrim(p_subscription_id), '') IS NULL THEN
    RAISE EXCEPTION 'Stripe subscription id is required' USING ERRCODE = '22023';
  END IF;
  IF p_status NOT IN ('Active', 'Overdue', 'Completed', 'Cancelled') THEN
    RAISE EXCEPTION 'Unsupported rental status: %', p_status USING ERRCODE = '22023';
  END IF;
  IF p_event_created_at IS NULL OR NULLIF(btrim(p_event_id), '') IS NULL THEN
    RAISE EXCEPTION 'Stripe event watermark is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.rentals AS rental
  SET
    status = p_status,
    end_date = CASE WHEN p_end_date IS NULL THEN rental.end_date ELSE p_end_date END,
    stripe_status_event_created_at = p_event_created_at,
    stripe_status_event_id = p_event_id,
    stripe_status_event_terminal = p_terminal
  WHERE rental.stripe_subscription_id = p_subscription_id
    AND (
      rental.stripe_status_event_created_at IS NULL
      OR rental.stripe_status_event_created_at < p_event_created_at
      OR (
        rental.stripe_status_event_created_at = p_event_created_at
        AND p_terminal
        AND NOT rental.stripe_status_event_terminal
      )
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN QUERY
  SELECT
    EXISTS (
      SELECT 1
      FROM public.rentals AS rental
      WHERE rental.stripe_subscription_id = p_subscription_id
    ),
    updated_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_stripe_rental_status_event(
  TEXT, TEXT, DATE, TIMESTAMPTZ, TEXT, BOOLEAN
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stripe_rental_status_event(
  TEXT, TEXT, DATE, TIMESTAMPTZ, TEXT, BOOLEAN
) TO service_role;

COMMIT;
