BEGIN;

CREATE TABLE IF NOT EXISTS public.toll_notice_delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  toll_transfer_notice_id BIGINT NOT NULL
    REFERENCES public.toll_transfer_notices(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  provider_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMPTZ,
  UNIQUE (toll_transfer_notice_id, recipient_email, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_toll_notice_delivery_attempts_notice
  ON public.toll_notice_delivery_attempts (toll_transfer_notice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_toll_notice_delivery_attempts_status
  ON public.toll_notice_delivery_attempts (status, updated_at);

ALTER TABLE public.toll_notice_delivery_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.toll_notice_delivery_attempts FROM anon, authenticated;
GRANT ALL ON public.toll_notice_delivery_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.create_manual_invoice_transaction(
  p_invoice JSONB,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice public.manual_invoices%ROWTYPE;
  v_items JSONB;
  v_subtotal NUMERIC(12, 2);
  v_gst NUMERIC(12, 2);
  v_total NUMERIC(12, 2);
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Manual invoice must contain between 1 and 50 items'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    round(sum(item.quantity * item.unit_price), 2),
    round(sum(item.gst), 2),
    round(sum((item.quantity * item.unit_price) + item.gst), 2)
  INTO v_subtotal, v_gst, v_total
  FROM jsonb_to_recordset(p_items) AS item(
    description TEXT,
    quantity NUMERIC,
    unit_price NUMERIC,
    gst NUMERIC,
    sort_order INTEGER
  );

  INSERT INTO public.manual_invoices (
    invoice_number,
    status,
    issue_date,
    due_date,
    bill_to_name,
    bill_to_abn_mobile,
    vehicle_reference,
    rental_period_reference,
    notes,
    additional_details,
    subtotal,
    gst,
    total_inc_gst,
    created_by
  ) VALUES (
    upper(trim(p_invoice->>'invoice_number')),
    p_invoice->>'status',
    (p_invoice->>'issue_date')::DATE,
    nullif(p_invoice->>'due_date', '')::DATE,
    p_invoice->>'bill_to_name',
    nullif(p_invoice->>'bill_to_abn_mobile', ''),
    nullif(p_invoice->>'vehicle_reference', ''),
    nullif(p_invoice->>'rental_period_reference', ''),
    nullif(p_invoice->>'notes', ''),
    nullif(p_invoice->>'additional_details', ''),
    coalesce(v_subtotal, 0),
    coalesce(v_gst, 0),
    coalesce(v_total, 0),
    nullif(p_invoice->>'created_by', '')
  )
  RETURNING * INTO v_invoice;

  INSERT INTO public.manual_invoice_items (
    invoice_id,
    description,
    quantity,
    unit_price,
    gst,
    amount,
    sort_order
  )
  SELECT
    v_invoice.id,
    item.description,
    item.quantity,
    item.unit_price,
    item.gst,
    round((item.quantity * item.unit_price) + item.gst, 2),
    item.sort_order
  FROM jsonb_to_recordset(p_items) AS item(
    description TEXT,
    quantity NUMERIC,
    unit_price NUMERIC,
    gst NUMERIC,
    sort_order INTEGER
  );

  INSERT INTO public.admin_audit_events (
    action,
    actor,
    target_type,
    target_id,
    metadata
  ) VALUES (
    'manual_invoice.created',
    nullif(p_invoice->>'created_by', ''),
    'manual_invoice',
    v_invoice.id::TEXT,
    jsonb_build_object('invoice_number', v_invoice.invoice_number, 'total_inc_gst', v_invoice.total_inc_gst)
  );

  SELECT coalesce(jsonb_agg(to_jsonb(item) ORDER BY item.sort_order), '[]'::JSONB)
  INTO v_items
  FROM public.manual_invoice_items AS item
  WHERE item.invoice_id = v_invoice.id;

  RETURN to_jsonb(v_invoice) || jsonb_build_object('items', v_items);
END;
$$;

CREATE OR REPLACE FUNCTION public.aggregate_stripe_balance_transactions(
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'gross', coalesce(sum(transaction.amount), 0),
    'net', coalesce(sum(transaction.net), 0),
    'count', count(*)
  )
  FROM public.stripe_balance_transactions AS transaction
  WHERE transaction.created_at >= p_start
    AND transaction.created_at <= p_end;
$$;

CREATE OR REPLACE FUNCTION public.list_current_customer_invoice_summaries(
  p_search TEXT,
  p_page INTEGER,
  p_page_size INTEGER
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH invoice_summary AS (
    SELECT
      invoice.customer_id,
      count(*)::INTEGER AS invoice_count,
      coalesce(sum(invoice.amount), 0) AS total_billed,
      coalesce(sum(invoice.balance), 0) AS outstanding_balance,
      max(invoice.invoice_date) AS last_invoice_date
    FROM public.invoices AS invoice
    WHERE invoice.is_imported = FALSE
      AND invoice.customer_id IS NOT NULL
    GROUP BY invoice.customer_id
  ),
  eligible AS (
    SELECT
      customer.*,
      coalesce(summary.invoice_count, 0) AS invoice_count,
      coalesce(summary.total_billed, 0) AS total_billed,
      coalesce(summary.outstanding_balance, 0) AS outstanding_balance,
      summary.last_invoice_date
    FROM public.customers AS customer
    LEFT JOIN invoice_summary AS summary ON summary.customer_id = customer.id
    WHERE customer.is_imported = FALSE
      AND (
        nullif(trim(coalesce(p_search, '')), '') IS NULL
        OR customer.full_name ILIKE '%' || trim(p_search) || '%'
        OR coalesce(customer.email, '') ILIKE '%' || trim(p_search) || '%'
        OR coalesce(customer.phone, '') ILIKE '%' || trim(p_search) || '%'
        OR coalesce(customer.company_name, '') ILIKE '%' || trim(p_search) || '%'
        OR coalesce(customer.staff_number, '') ILIKE '%' || trim(p_search) || '%'
        OR coalesce(customer.external_id, '') ILIKE '%' || trim(p_search) || '%'
      )
      AND (
        nullif(trim(coalesce(customer.email, '')), '') IS NOT NULL
        OR nullif(trim(coalesce(customer.phone, '')), '') IS NOT NULL
        OR nullif(trim(coalesce(customer.company_name, '')), '') IS NOT NULL
        OR nullif(trim(coalesce(customer.staff_number, '')), '') IS NOT NULL
        OR nullif(trim(coalesce(customer.external_id, '')), '') IS NOT NULL
        OR coalesce(summary.invoice_count, 0) > 0
        OR coalesce(summary.total_billed, 0) > 0
        OR coalesce(summary.outstanding_balance, 0) > 0
        OR summary.last_invoice_date IS NOT NULL
      )
  ),
  pagination AS (
    SELECT
      count(*)::INTEGER AS total_items,
      greatest(1, ceil(count(*)::NUMERIC / greatest(1, least(coalesce(p_page_size, 25), 100)))::INTEGER) AS total_pages,
      greatest(1, coalesce(p_page, 1)) AS requested_page,
      greatest(1, least(coalesce(p_page_size, 25), 100)) AS page_size
    FROM eligible
  ),
  bounded AS (
    SELECT
      pagination.*,
      least(pagination.requested_page, pagination.total_pages) AS page
    FROM pagination
  ),
  page_rows AS (
    SELECT eligible.*
    FROM eligible
    CROSS JOIN bounded
    ORDER BY eligible.full_name ASC, eligible.id ASC
    LIMIT (SELECT page_size FROM bounded)
    OFFSET (SELECT (page - 1) * page_size FROM bounded)
  )
  SELECT jsonb_build_object(
    'items', coalesce(
      (SELECT jsonb_agg(to_jsonb(page_row) ORDER BY page_row.full_name, page_row.id) FROM page_rows AS page_row),
      '[]'::JSONB
    ),
    'page', bounded.page,
    'pageSize', bounded.page_size,
    'totalItems', bounded.total_items,
    'totalPages', bounded.total_pages
  )
  FROM bounded;
$$;

CREATE OR REPLACE FUNCTION public.create_agreement_template_version(
  p_template_key TEXT,
  p_name TEXT,
  p_content TEXT,
  p_updated_by TEXT,
  p_activate BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_created public.agreement_templates%ROWTYPE;
  v_version INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('agreement-template:' || p_template_key, 0));

  SELECT coalesce(max(template.version), 0) + 1
  INTO v_version
  FROM public.agreement_templates AS template
  WHERE template.template_key = p_template_key;

  IF p_activate THEN
    UPDATE public.agreement_templates
    SET active = FALSE, updated_at = CURRENT_TIMESTAMP
    WHERE template_key = p_template_key AND active = TRUE;
  END IF;

  INSERT INTO public.agreement_templates (
    template_key,
    name,
    content,
    version,
    active,
    updated_by
  ) VALUES (
    p_template_key,
    p_name,
    p_content,
    v_version,
    p_activate,
    p_updated_by
  )
  RETURNING * INTO v_created;

  INSERT INTO public.admin_audit_events (action, actor, target_type, target_id, metadata)
  VALUES (
    'agreement_template.created',
    p_updated_by,
    'agreement_template',
    v_created.id::TEXT,
    jsonb_build_object('template_key', v_created.template_key, 'version', v_created.version, 'active', v_created.active)
  );

  RETURN to_jsonb(v_created);
END;
$$;

CREATE OR REPLACE FUNCTION public.revise_agreement_template(
  p_source_id BIGINT,
  p_name TEXT,
  p_content TEXT,
  p_updated_by TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source public.agreement_templates%ROWTYPE;
  v_created public.agreement_templates%ROWTYPE;
  v_version INTEGER;
BEGIN
  SELECT * INTO v_source
  FROM public.agreement_templates
  WHERE id = p_source_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('agreement-template:' || v_source.template_key, 0));

  SELECT * INTO v_source
  FROM public.agreement_templates
  WHERE id = p_source_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(max(template.version), 0) + 1
  INTO v_version
  FROM public.agreement_templates AS template
  WHERE template.template_key = v_source.template_key;

  IF v_source.active THEN
    UPDATE public.agreement_templates
    SET active = FALSE, updated_at = CURRENT_TIMESTAMP
    WHERE template_key = v_source.template_key AND active = TRUE;
  END IF;

  INSERT INTO public.agreement_templates (
    template_key,
    name,
    content,
    version,
    active,
    updated_by
  ) VALUES (
    v_source.template_key,
    coalesce(p_name, v_source.name),
    p_content,
    v_version,
    v_source.active,
    p_updated_by
  )
  RETURNING * INTO v_created;

  INSERT INTO public.admin_audit_events (action, actor, target_type, target_id, metadata)
  VALUES (
    'agreement_template.revised',
    p_updated_by,
    'agreement_template',
    v_created.id::TEXT,
    jsonb_build_object('source_id', v_source.id, 'template_key', v_created.template_key, 'version', v_created.version)
  );

  RETURN to_jsonb(v_created);
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_agreement_template(
  p_template_id BIGINT,
  p_updated_by TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_template public.agreement_templates%ROWTYPE;
BEGIN
  SELECT * INTO v_template
  FROM public.agreement_templates
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('agreement-template:' || v_template.template_key, 0));

  SELECT * INTO v_template
  FROM public.agreement_templates
  WHERE id = p_template_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.agreement_templates
  SET active = FALSE, updated_at = CURRENT_TIMESTAMP
  WHERE template_key = v_template.template_key AND active = TRUE;

  UPDATE public.agreement_templates
  SET active = TRUE, updated_by = p_updated_by, updated_at = CURRENT_TIMESTAMP
  WHERE id = v_template.id
  RETURNING * INTO v_template;

  INSERT INTO public.admin_audit_events (action, actor, target_type, target_id, metadata)
  VALUES (
    'agreement_template.activated',
    p_updated_by,
    'agreement_template',
    v_template.id::TEXT,
    jsonb_build_object('template_key', v_template.template_key, 'version', v_template.version)
  );

  RETURN to_jsonb(v_template);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_toll_notice_delivery(
  p_notice_id BIGINT,
  p_recipient_email TEXT,
  p_content_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.toll_notice_delivery_attempts%ROWTYPE;
  v_attempt_id UUID := gen_random_uuid();
  v_recipient TEXT := lower(trim(p_recipient_email));
BEGIN
  INSERT INTO public.toll_notice_delivery_attempts (
    id,
    toll_transfer_notice_id,
    recipient_email,
    content_hash,
    idempotency_key
  ) VALUES (
    v_attempt_id,
    p_notice_id,
    v_recipient,
    p_content_hash,
    'toll-notice-' || v_attempt_id::TEXT
  )
  ON CONFLICT (toll_transfer_notice_id, recipient_email, content_hash) DO NOTHING;

  UPDATE public.toll_notice_delivery_attempts
  SET
    status = 'sending',
    attempt_count = attempt_count + 1,
    error_message = NULL,
    updated_at = CURRENT_TIMESTAMP
  WHERE toll_transfer_notice_id = p_notice_id
    AND recipient_email = v_recipient
    AND content_hash = p_content_hash
    AND (
      status IN ('pending', 'failed')
      OR (status = 'sending' AND updated_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes')
    )
  RETURNING * INTO v_attempt;

  IF FOUND THEN
    RETURN to_jsonb(v_attempt) || jsonb_build_object('claimed', TRUE);
  END IF;

  SELECT * INTO v_attempt
  FROM public.toll_notice_delivery_attempts
  WHERE toll_transfer_notice_id = p_notice_id
    AND recipient_email = v_recipient
    AND content_hash = p_content_hash;

  RETURN to_jsonb(v_attempt) || jsonb_build_object('claimed', FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_toll_notice_delivery(
  p_attempt_id UUID,
  p_provider_message_id TEXT,
  p_actor TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.toll_notice_delivery_attempts%ROWTYPE;
  v_notice public.toll_transfer_notices%ROWTYPE;
  v_sent_at TIMESTAMPTZ := CURRENT_TIMESTAMP;
BEGIN
  UPDATE public.toll_notice_delivery_attempts
  SET
    status = 'sent',
    provider_message_id = nullif(p_provider_message_id, ''),
    error_message = NULL,
    sent_at = v_sent_at,
    updated_at = v_sent_at
  WHERE id = p_attempt_id AND status = 'sending'
  RETURNING * INTO v_attempt;

  IF NOT FOUND THEN
    SELECT * INTO v_attempt
    FROM public.toll_notice_delivery_attempts
    WHERE id = p_attempt_id AND status = 'sent';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Toll notice delivery attempt is not claimable'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.toll_transfer_notices
  SET
    sent_at = coalesce(sent_at, v_sent_at),
    sent_to = v_attempt.recipient_email,
    status = 'sent',
    updated_at = v_sent_at
  WHERE id = v_attempt.toll_transfer_notice_id
  RETURNING * INTO v_notice;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Toll transfer notice does not exist'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.toll_transfer_notice_audit_events (
    action,
    actor,
    metadata,
    toll_transfer_notice_id
  )
  SELECT
    'send_email',
    p_actor,
    jsonb_build_object(
      'recipient_email', v_attempt.recipient_email,
      'delivery_attempt_id', v_attempt.id,
      'provider_message_id', v_attempt.provider_message_id
    ),
    v_notice.id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.toll_transfer_notice_audit_events AS audit
    WHERE audit.toll_transfer_notice_id = v_notice.id
      AND audit.action = 'send_email'
      AND audit.metadata->>'delivery_attempt_id' = v_attempt.id::TEXT
  );

  RETURN to_jsonb(v_notice);
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_toll_notice_delivery(
  p_attempt_id UUID,
  p_error_message TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.toll_notice_delivery_attempts
  SET
    status = 'failed',
    error_message = left(coalesce(p_error_message, 'Unknown delivery failure'), 1000),
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_attempt_id AND status = 'sending';
$$;

REVOKE ALL ON FUNCTION public.create_manual_invoice_transaction(JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aggregate_stripe_balance_transactions(TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_current_customer_invoice_summaries(TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_agreement_template_version(TEXT, TEXT, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revise_agreement_template(BIGINT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activate_agreement_template(BIGINT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_toll_notice_delivery(BIGINT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_toll_notice_delivery(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_toll_notice_delivery(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_manual_invoice_transaction(JSONB, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.aggregate_stripe_balance_transactions(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_current_customer_invoice_summaries(TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_agreement_template_version(TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.revise_agreement_template(BIGINT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_agreement_template(BIGINT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_toll_notice_delivery(BIGINT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_toll_notice_delivery(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_toll_notice_delivery(UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
