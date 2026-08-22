-- H3: Stripe lifecycle delivery order must never rewrite rental history from
-- one terminal meaning to another. Any legacy mismatch is corrected through an
-- explicit, audited admin process rather than this event-ordering function.
BEGIN;

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
  IF p_status IS NULL OR p_status NOT IN ('Active', 'Overdue', 'Completed', 'Cancelled') THEN
    RAISE EXCEPTION 'Unsupported rental status: %', p_status USING ERRCODE = '22023';
  END IF;
  IF p_terminal IS NULL OR p_terminal <> (p_status IN ('Completed', 'Cancelled')) THEN
    RAISE EXCEPTION 'Stripe rental terminal flag does not match status: %', p_status USING ERRCODE = '22023';
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
    -- Terminal history is immutable here, including rows completed by the
    -- synchronous admin path before their deletion webhook arrives.
    AND rental.status NOT IN ('Completed', 'Cancelled')
    AND NOT rental.stripe_status_event_terminal
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

COMMENT ON FUNCTION public.apply_stripe_rental_status_event(
  TEXT, TEXT, DATE, TIMESTAMPTZ, TEXT, BOOLEAN
) IS 'Applies ordered Stripe rental status events without rewriting terminal rental history; legacy terminal conflicts require explicit correction.';

COMMIT;
