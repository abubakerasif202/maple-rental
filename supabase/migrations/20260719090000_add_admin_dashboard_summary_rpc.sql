BEGIN;

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_summary()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH
  real_applications AS MATERIALIZED (
    SELECT application.*
    FROM public.applications AS application
    WHERE application.legacy_id IS NULL
      AND COALESCE(lower(application.email), '') NOT LIKE '%@example.invalid'
      AND COALESCE(application.phone, '') <> '0000000000'
      AND COALESCE(lower(application.license_number), '') NOT LIKE 'legacy-%'
      AND COALESCE(lower(application.experience), '') NOT LIKE '%imported from live fleet data%'
      AND COALESCE(lower(application.experience), '') NOT LIKE '%legacy renter import%'
  ),
  imported_application_ids AS MATERIALIZED (
    SELECT application.id
    FROM public.applications AS application
    WHERE application.legacy_id IS NOT NULL
      OR COALESCE(lower(application.email), '') LIKE '%@example.invalid'
      OR COALESCE(application.phone, '') = '0000000000'
      OR COALESCE(lower(application.license_number), '') LIKE 'legacy-%'
      OR COALESCE(lower(application.experience), '') LIKE '%imported from live fleet data%'
      OR COALESCE(lower(application.experience), '') LIKE '%legacy renter import%'
  ),
  real_rentals AS MATERIALIZED (
    SELECT rental.*
    FROM public.rentals AS rental
    WHERE rental.legacy_application_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM imported_application_ids AS imported
        WHERE imported.id = rental.application_id
      )
  ),
  status_counts AS (
    SELECT COALESCE(application.status, 'Unknown') AS status, count(*)::INTEGER AS total
    FROM real_applications AS application
    GROUP BY COALESCE(application.status, 'Unknown')
  ),
  application_totals AS (
    SELECT
      count(*)::INTEGER AS total_applications,
      count(*) FILTER (WHERE status = 'Pending')::INTEGER AS pending_applications,
      count(*) FILTER (WHERE status = 'Paid')::INTEGER AS paid_applications
    FROM real_applications
  ),
  rental_totals AS (
    SELECT
      count(*) FILTER (WHERE status = 'Active')::INTEGER AS active_rentals,
      COALESCE(sum(weekly_price) FILTER (WHERE status = 'Active'), 0)::NUMERIC
        AS total_weekly_income
    FROM real_rentals
  ),
  invoice_totals AS (
    SELECT
      COALESCE(sum(GREATEST(COALESCE(invoice.balance, 0), 0)), 0)::NUMERIC
        AS outstanding_invoices,
      count(*) FILTER (WHERE COALESCE(invoice.balance, 0) > 0)::INTEGER
        AS overdue_invoices
    FROM public.invoices AS invoice
  ),
  agreement_totals AS (
    SELECT
      count(*)::INTEGER AS agreements_generated
    FROM public.lease_agreements AS agreement
  ),
  agreement_attention AS (
    SELECT count(*)::INTEGER AS total
    FROM real_applications AS application
    WHERE application.status = 'Paid'
      AND NOT EXISTS (
        SELECT 1
        FROM public.lease_agreements AS agreement
        WHERE agreement.application_id = application.id
      )
  ),
  customer_totals AS (
    SELECT count(*)::INTEGER AS total_customers
    FROM public.customers
  ),
  recent_applications AS (
    SELECT
      application.id,
      application.name,
      application.status,
      application.created_at,
      application.approved_vehicle
    FROM real_applications AS application
    ORDER BY application.created_at DESC
    LIMIT 8
  ),
  recent_paid_applications AS (
    SELECT application.*
    FROM real_applications AS application
    WHERE application.status = 'Paid'
    ORDER BY application.paid_at DESC NULLS LAST
    LIMIT 8
  ),
  recent_rentals AS (
    SELECT
      rental.*,
      application.name AS application_name
    FROM real_rentals AS rental
    LEFT JOIN public.applications AS application ON application.id = rental.application_id
    WHERE rental.status = 'Active'
    ORDER BY rental.created_at DESC
    LIMIT 8
  ),
  recent_audits AS MATERIALIZED (
    SELECT audit.*
    FROM public.admin_audit_events AS audit
    ORDER BY audit.created_at DESC
    LIMIT 8
  ),
  trend_days AS (
    SELECT generate_series(
      ((CURRENT_TIMESTAMP AT TIME ZONE 'Australia/Sydney')::DATE - 6),
      (CURRENT_TIMESTAMP AT TIME ZONE 'Australia/Sydney')::DATE,
      INTERVAL '1 day'
    )::DATE AS day
  ),
  application_created_trend AS (
    SELECT
      (application.created_at AT TIME ZONE 'Australia/Sydney')::DATE AS day,
      count(*)::INTEGER AS applications
    FROM real_applications AS application
    WHERE application.created_at >=
      (((CURRENT_TIMESTAMP AT TIME ZONE 'Australia/Sydney')::DATE - 6)::TIMESTAMP
        AT TIME ZONE 'Australia/Sydney')
    GROUP BY (application.created_at AT TIME ZONE 'Australia/Sydney')::DATE
  ),
  application_paid_trend AS (
    SELECT
      (application.paid_at AT TIME ZONE 'Australia/Sydney')::DATE AS day,
      count(*) FILTER (WHERE application.status = 'Paid')::INTEGER AS paid_applications
    FROM real_applications AS application
    WHERE application.paid_at IS NOT NULL
      AND application.paid_at >=
        (((CURRENT_TIMESTAMP AT TIME ZONE 'Australia/Sydney')::DATE - 6)::TIMESTAMP
          AT TIME ZONE 'Australia/Sydney')
    GROUP BY (application.paid_at AT TIME ZONE 'Australia/Sydney')::DATE
  ),
  rental_trend AS (
    SELECT
      (rental.created_at AT TIME ZONE 'Australia/Sydney')::DATE AS day,
      count(*)::INTEGER AS rentals,
      COALESCE(sum(rental.weekly_price), 0)::NUMERIC AS revenue
    FROM real_rentals AS rental
    WHERE rental.status = 'Active'
      AND rental.created_at >=
      (((CURRENT_TIMESTAMP AT TIME ZONE 'Australia/Sydney')::DATE - 6)::TIMESTAMP
        AT TIME ZONE 'Australia/Sydney')
    GROUP BY (rental.created_at AT TIME ZONE 'Australia/Sydney')::DATE
  ),
  audit_trend AS (
    SELECT
      (audit.created_at AT TIME ZONE 'Australia/Sydney')::DATE AS day,
      count(*)::INTEGER AS audits
    FROM recent_audits AS audit
    GROUP BY (audit.created_at AT TIME ZONE 'Australia/Sydney')::DATE
  )
  SELECT jsonb_build_object(
    'active_rentals', rental_totals.active_rentals,
    'agreements_awaiting_attention',
      agreement_attention.total,
    'agreements_generated', agreement_totals.agreements_generated,
    'applications_by_status',
      COALESCE(
        (SELECT jsonb_object_agg(status, total) FROM status_counts),
        '{}'::JSONB
      ),
    'outstanding_invoices', invoice_totals.outstanding_invoices,
    'overdue_invoices', invoice_totals.overdue_invoices,
    'pending_applications', application_totals.pending_applications,
    'paid_applications', application_totals.paid_applications,
    'recent_admin_actions',
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', audit.id::TEXT,
              'type', 'audit',
              'title', initcap(replace(audit.action, '_', ' ')),
              'subtitle',
                NULLIF(concat_ws(' • ', audit.target_type, audit.target_id), ''),
              'actor', audit.actor,
              'created_at', audit.created_at,
              'status', NULL
            )
            ORDER BY audit.created_at DESC
          )
          FROM recent_audits AS audit
        ),
        '[]'::JSONB
      ),
    'recent_applications',
      COALESCE(
        (
          SELECT jsonb_agg(to_jsonb(application) ORDER BY application.created_at DESC)
          FROM recent_applications AS application
        ),
        '[]'::JSONB
      ),
    'recent_payments',
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', application.id::TEXT,
              'type', 'payment',
              'title', concat(COALESCE(NULLIF(application.name, ''), 'Application'), ' marked paid'),
              'subtitle',
                concat(
                  COALESCE(NULLIF(application.approved_vehicle, ''), 'Registration not recorded'),
                  ' • ',
                  CASE
                    WHEN COALESCE(application.approved_weekly_price, 0) > 0
                      THEN concat(
                        '$',
                        to_char(application.approved_weekly_price, 'FM999999990.00'),
                        '/week'
                      )
                    ELSE 'Weekly price not set'
                  END
                ),
              'actor', NULL,
              'amount', COALESCE(application.approved_weekly_price, 0),
              'created_at', application.paid_at,
              'status', application.status
            )
            ORDER BY application.paid_at DESC NULLS LAST
          )
          FROM recent_paid_applications AS application
        ),
        '[]'::JSONB
      ),
    'recent_rental_activity',
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', rental.id::TEXT,
              'type', 'rental',
              'title', concat(COALESCE(NULLIF(rental.application_name, ''), 'Rental'), ' active'),
              'subtitle',
                concat(
                  COALESCE(NULLIF(rental.vehicle_registration, ''), 'Registration not recorded'),
                  ' • ',
                  CASE
                    WHEN COALESCE(rental.weekly_price, 0) > 0
                      THEN concat('$', to_char(rental.weekly_price, 'FM999999990.00'), '/week')
                    ELSE 'No weekly price'
                  END
                ),
              'actor', NULL,
              'amount', COALESCE(rental.weekly_price, 0),
              'created_at', rental.created_at,
              'status', rental.status
            )
            ORDER BY rental.created_at DESC
          )
          FROM recent_rentals AS rental
        ),
        '[]'::JSONB
      ),
    'revenue_trend',
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'label', to_char(day.day, 'YYYY-MM-DD'),
              'applications', COALESCE(application_created.applications, 0),
              'paidApplications',
                COALESCE(application_paid.paid_applications, 0),
              'rentals', COALESCE(rental_daily.rentals, 0),
              'revenue',
                COALESCE(rental_daily.revenue, 0),
              'audits', COALESCE(audit_daily.audits, 0)
            )
            ORDER BY day.day
          )
          FROM trend_days AS day
          LEFT JOIN application_created_trend AS application_created
            ON application_created.day = day.day
          LEFT JOIN application_paid_trend AS application_paid
            ON application_paid.day = day.day
          LEFT JOIN rental_trend AS rental_daily ON rental_daily.day = day.day
          LEFT JOIN audit_trend AS audit_daily ON audit_daily.day = day.day
        ),
        '[]'::JSONB
      ),
    'status_distribution',
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object('label', status, 'value', total)
            ORDER BY total DESC, status
          )
          FROM status_counts
        ),
        '[]'::JSONB
      ),
    'summary_generated_at', CURRENT_TIMESTAMP,
    'total_applications', application_totals.total_applications,
    'total_customers', customer_totals.total_customers,
    'total_weekly_income', rental_totals.total_weekly_income,
    'weekly_recurring_revenue', rental_totals.total_weekly_income
  )
  FROM application_totals
  CROSS JOIN rental_totals
  CROSS JOIN invoice_totals
  CROSS JOIN agreement_totals
  CROSS JOIN agreement_attention
  CROSS JOIN customer_totals;
$$;

REVOKE ALL ON FUNCTION public.get_admin_dashboard_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_dashboard_summary() FROM anon;
REVOKE ALL ON FUNCTION public.get_admin_dashboard_summary() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_summary() TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
