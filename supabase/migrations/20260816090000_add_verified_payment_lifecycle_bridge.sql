-- Verified Stripe payment lifecycle bridge.
--
-- Purpose
--   Records the verified relationship application -> Checkout Session ->
--   Stripe customer -> Stripe subscription, links operational customers and
--   invoices to Stripe identity, and enforces at the database level that a
--   single live rental exists per application and per subscription.
--
-- Payment-only invariant
--   This migration stores identity and enforces uniqueness. It does not assign
--   a vehicle, does not mutate fleet state, and does not create a rental.
--   Rental creation remains an explicit admin-authorized action.
--
-- Existing schema reviewed before writing this migration
--   20260715023000_persist_checkout_subscription_relation.sql and
--   20260721090000_persist_stripe_customer_identity.sql add
--   stripe_subscription_id / stripe_customer_id to public.stripe_webhook_events
--   only. public.applications, public.customers and public.invoices carry no
--   Stripe identity columns, so the columns below are genuinely new rather
--   than duplicates. public.rentals already has stripe_subscription_id and
--   stripe_customer_id from 20260304004102_optimized_schema_snake_case.sql and
--   is therefore not re-added here.
--
-- Safety
--   Additive only. No column is dropped, retyped, or backfilled destructively.
--   The unique indexes are partial and are preflighted below so the migration
--   fails with an actionable message instead of a bare index violation.
--
-- Rollback
--   DROP INDEX the indexes created here, then ALTER TABLE ... DROP COLUMN the
--   columns created here, after all dependent application code is removed.

BEGIN;

SET LOCAL lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Verified Stripe identity on the application
-- ---------------------------------------------------------------------------
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

COMMENT ON COLUMN public.applications.stripe_checkout_session_id IS
  'Checkout Session that produced the verified payment. Set only after signature-verified fulfilment or trusted reconciliation.';
COMMENT ON COLUMN public.applications.stripe_customer_id IS
  'Stripe customer established by verified payment. Never accepted from client input.';
COMMENT ON COLUMN public.applications.stripe_subscription_id IS
  'Stripe subscription established by verified payment. Never accepted from client input.';

-- One application per subscription. Preflight first so a genuine data conflict
-- reports which subscriptions collide rather than failing opaquely.
DO $$
DECLARE
  conflicting TEXT;
BEGIN
  SELECT string_agg(DISTINCT stripe_subscription_id, ', ')
  INTO conflicting
  FROM (
    SELECT stripe_subscription_id
    FROM public.applications
    WHERE stripe_subscription_id IS NOT NULL
    GROUP BY stripe_subscription_id
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF conflicting IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot enforce one application per Stripe subscription; these subscriptions map to multiple applications: %',
      conflicting;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS applications_stripe_subscription_id_unique
  ON public.applications (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS applications_stripe_customer_id_idx
  ON public.applications (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Supports the "paid subscriptions awaiting activation" admin query.
CREATE INDEX IF NOT EXISTS applications_paid_awaiting_activation_idx
  ON public.applications (status, stripe_subscription_id)
  WHERE status = 'Paid' AND stripe_subscription_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Operational customer linkage
-- ---------------------------------------------------------------------------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS application_id UUID REFERENCES public.applications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

COMMENT ON COLUMN public.customers.application_id IS
  'Durable link to the originating application. Preferred identity for customer matching; name is never used to merge customers.';

DO $$
DECLARE
  conflicting TEXT;
BEGIN
  SELECT string_agg(DISTINCT application_id::TEXT, ', ')
  INTO conflicting
  FROM (
    SELECT application_id
    FROM public.customers
    WHERE application_id IS NOT NULL
    GROUP BY application_id
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF conflicting IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot enforce one operational customer per application; these applications map to multiple customers: %',
      conflicting;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS customers_application_id_unique
  ON public.customers (application_id)
  WHERE application_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_stripe_customer_id_unique
  ON public.customers (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Operational invoice linkage
-- ---------------------------------------------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

COMMENT ON COLUMN public.invoices.stripe_invoice_id IS
  'Real Stripe invoice id. Idempotency key for Stripe invoice synchronisation; never fabricated.';

CREATE UNIQUE INDEX IF NOT EXISTS invoices_stripe_invoice_id_unique
  ON public.invoices (stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS invoices_stripe_subscription_id_idx
  ON public.invoices (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Rental linkage and live-rental uniqueness
-- ---------------------------------------------------------------------------
-- public.rentals already carries stripe_subscription_id and stripe_customer_id.
-- Only the operational customer link is new.
ALTER TABLE public.rentals
  ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rentals_customer_id_idx ON public.rentals (customer_id);

-- Database-level duplicate-activation guard.
--
-- "Live" is defined as NOT terminal so the guard keeps holding if a new
-- non-terminal status is introduced. Completed and cancelled rentals are
-- history and are deliberately excluded, so a customer can legitimately rent
-- again later.
DO $$
DECLARE
  conflicting TEXT;
BEGIN
  SELECT string_agg(DISTINCT stripe_subscription_id, ', ')
  INTO conflicting
  FROM (
    SELECT stripe_subscription_id
    FROM public.rentals
    WHERE stripe_subscription_id IS NOT NULL
      AND lower(status) NOT IN ('completed', 'cancelled')
    GROUP BY stripe_subscription_id
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF conflicting IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot enforce one live rental per Stripe subscription; these subscriptions already have multiple live rentals: %',
      conflicting;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS rentals_live_stripe_subscription_unique
  ON public.rentals (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL
    AND lower(status) NOT IN ('completed', 'cancelled');

DO $$
DECLARE
  conflicting TEXT;
BEGIN
  SELECT string_agg(DISTINCT application_id::TEXT, ', ')
  INTO conflicting
  FROM (
    SELECT application_id
    FROM public.rentals
    WHERE application_id IS NOT NULL
      AND lower(status) NOT IN ('completed', 'cancelled')
    GROUP BY application_id
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF conflicting IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot enforce one live rental per application; these applications already have multiple live rentals: %',
      conflicting;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS rentals_live_application_unique
  ON public.rentals (application_id)
  WHERE application_id IS NOT NULL
    AND lower(status) NOT IN ('completed', 'cancelled');

NOTIFY pgrst, 'reload schema';

COMMIT;
