-- Atomically persist the verified Stripe identity relationship, operational
-- customer linkage, and its audit event. Payment recording remains a separate
-- payment-only transition; this function never creates a rental or mutates a
-- vehicle.

BEGIN;

CREATE OR REPLACE FUNCTION public.persist_verified_stripe_relationship(
  p_application_id UUID,
  p_payment_link_version INTEGER,
  p_checkout_session_id TEXT,
  p_stripe_customer_id TEXT,
  p_stripe_subscription_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_application public.applications%ROWTYPE;
  v_by_application public.customers%ROWTYPE;
  v_by_stripe public.customers%ROWTYPE;
  v_customer public.customers%ROWTYPE;
  v_operation TEXT := 'unchanged';
BEGIN
  IF nullif(trim(p_stripe_customer_id), '') IS NULL
     OR nullif(trim(p_stripe_subscription_id), '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'maple_error:invalid_stripe_identity';
  END IF;

  SELECT * INTO v_application
  FROM public.applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'maple_error:application_missing';
  END IF;
  IF v_application.status = 'Cancelled' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'maple_error:application_cancelled';
  END IF;
  IF v_application.payment_link_version <> p_payment_link_version THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'maple_error:payment_link_version_mismatch';
  END IF;
  IF v_application.stripe_customer_id IS NOT NULL
     AND v_application.stripe_customer_id <> p_stripe_customer_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'maple_error:customer_identity_conflict';
  END IF;
  IF v_application.stripe_subscription_id IS NOT NULL
     AND v_application.stripe_subscription_id <> p_stripe_subscription_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'maple_error:subscription_identity_conflict';
  END IF;
  IF p_checkout_session_id IS NOT NULL
     AND v_application.stripe_checkout_session_id IS NOT NULL
     AND v_application.stripe_checkout_session_id <> p_checkout_session_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'maple_error:checkout_session_identity_conflict';
  END IF;

  UPDATE public.applications
  SET
    stripe_checkout_session_id = coalesce(p_checkout_session_id, stripe_checkout_session_id),
    stripe_customer_id = p_stripe_customer_id,
    stripe_subscription_id = p_stripe_subscription_id
  WHERE id = v_application.id;

  IF v_application.status <> 'Paid' THEN
    RETURN jsonb_build_object('customerId', NULL, 'operation', 'unchanged');
  END IF;

  SELECT * INTO v_by_application
  FROM public.customers
  WHERE application_id = v_application.id
  FOR UPDATE;

  SELECT * INTO v_by_stripe
  FROM public.customers
  WHERE stripe_customer_id = p_stripe_customer_id
  FOR UPDATE;

  IF v_by_application.id IS NOT NULL
     AND v_by_stripe.id IS NOT NULL
     AND v_by_application.id <> v_by_stripe.id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'maple_error:customer_identity_ambiguous';
  END IF;
  IF v_by_application.stripe_customer_id IS NOT NULL
     AND v_by_application.stripe_customer_id <> p_stripe_customer_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'maple_error:customer_identity_ambiguous';
  END IF;
  IF v_by_stripe.application_id IS NOT NULL
     AND v_by_stripe.application_id <> v_application.id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'maple_error:customer_identity_ambiguous';
  END IF;

  IF v_by_application.id IS NOT NULL THEN
    v_customer := v_by_application;
  ELSE
    v_customer := v_by_stripe;
  END IF;
  IF v_customer.id IS NOT NULL THEN
    IF v_customer.application_id IS DISTINCT FROM v_application.id
       OR v_customer.stripe_customer_id IS DISTINCT FROM p_stripe_customer_id THEN
      v_operation := 'link';
    END IF;

    UPDATE public.customers
    SET
      application_id = v_application.id,
      email = v_application.email,
      full_name = coalesce(nullif(trim(v_application.name), ''), 'Maple Rentals customer'),
      phone = v_application.phone,
      street = v_application.address,
      stripe_customer_id = p_stripe_customer_id,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = v_customer.id
    RETURNING * INTO v_customer;
  ELSE
    BEGIN
      INSERT INTO public.customers (
        application_id,
        email,
        external_id,
        full_name,
        phone,
        source,
        street,
        stripe_customer_id,
        updated_at
      ) VALUES (
        v_application.id,
        v_application.email,
        'stripe:' || p_stripe_customer_id,
        coalesce(nullif(trim(v_application.name), ''), 'Maple Rentals customer'),
        v_application.phone,
        'stripe-verified',
        v_application.address,
        p_stripe_customer_id,
        CURRENT_TIMESTAMP
      ) RETURNING * INTO v_customer;
      v_operation := 'create';
    EXCEPTION WHEN unique_violation THEN
      SELECT * INTO v_customer
      FROM public.customers
      WHERE stripe_customer_id = p_stripe_customer_id
      FOR UPDATE;

      IF v_customer.id IS NULL
         OR v_customer.application_id IS DISTINCT FROM v_application.id THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'maple_error:customer_identity_ambiguous';
      END IF;
      v_operation := 'unchanged';
    END;
  END IF;

  IF v_operation <> 'unchanged' THEN
    INSERT INTO public.admin_audit_events (
      action,
      actor,
      metadata,
      target_id,
      target_type
    ) VALUES (
      CASE v_operation
        WHEN 'create' THEN 'operational_customer_created'
        ELSE 'operational_customer_linked'
      END,
      NULL,
      jsonb_build_object(
        'applicationId', v_application.id,
        'customerId', v_customer.id,
        'operation', v_operation,
        'paymentLinkVersion', p_payment_link_version,
        'source', 'verified-stripe-payment'
      ),
      v_application.id::TEXT,
      'application'
    );
  END IF;

  RETURN jsonb_build_object('customerId', v_customer.id, 'operation', v_operation);
END;
$$;

REVOKE ALL ON FUNCTION public.persist_verified_stripe_relationship(UUID, INTEGER, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_verified_stripe_relationship(UUID, INTEGER, TEXT, TEXT, TEXT)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Recovery: restore the prior application version and redeploy the previous
-- server. Dropping this function is safe only after no server calls it.
