-- Verified Stripe payment lifecycle bridge.
-- Payment remains payment-only: this stores identities and operational readiness;
-- it does not assign a vehicle, mutate fleet state, or create a rental.
BEGIN;

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS applications_stripe_subscription_id_unique
  ON public.applications (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS applications_stripe_customer_id_idx
  ON public.applications (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS applications_paid_subscription_idx
  ON public.applications (status, stripe_subscription_id)
  WHERE status = 'Paid' AND stripe_subscription_id IS NOT NULL;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS application_id UUID REFERENCES public.applications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS customers_application_id_unique
  ON public.customers (application_id)
  WHERE application_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customers_stripe_customer_id_unique
  ON public.customers (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_stripe_invoice_id_unique
  ON public.invoices (stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoices_stripe_subscription_id_idx
  ON public.invoices (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

ALTER TABLE public.rentals
  ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES public.customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS rentals_customer_id_idx ON public.rentals (customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS rentals_live_stripe_subscription_unique
  ON public.rentals (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL
    AND lower(status) IN ('active', 'overdue');

NOTIFY pgrst, 'reload schema';
COMMIT;
