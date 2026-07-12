-- Add trigram indexes for the admin search paths that rely on ILIKE.
-- Rollback notes:
--   DROP INDEX IF EXISTS statements below remove the added search indexes.
--   pg_trgm may remain installed if other indexes still depend on it.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_applications_name_trgm
  ON public.applications USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_applications_email_trgm
  ON public.applications USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_applications_phone_trgm
  ON public.applications USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_applications_license_number_trgm
  ON public.applications USING gin (license_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_applications_approved_vehicle_trgm
  ON public.applications USING gin (approved_vehicle gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_rentals_vehicle_registration_trgm
  ON public.rentals USING gin (vehicle_registration gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customers_full_name_trgm
  ON public.customers USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_email_trgm
  ON public.customers USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_phone_trgm
  ON public.customers USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_company_name_trgm
  ON public.customers USING gin (company_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_staff_number_trgm
  ON public.customers USING gin (staff_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_external_id_trgm
  ON public.customers USING gin (external_id gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_invoices_external_invoice_number_trgm
  ON public.invoices USING gin (external_invoice_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_name_trgm
  ON public.invoices USING gin (customer_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_invoices_car_registration_trgm
  ON public.invoices USING gin (car_registration gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_invoices_due_label_trgm
  ON public.invoices USING gin (due_label gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_invoices_transaction_summary_trgm
  ON public.invoices USING gin (transaction_summary gin_trgm_ops);

COMMIT;
