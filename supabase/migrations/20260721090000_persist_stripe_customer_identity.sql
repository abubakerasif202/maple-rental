alter table public.stripe_webhook_events
  add column if not exists stripe_customer_id text null;

create index if not exists stripe_webhook_events_customer_id_idx
  on public.stripe_webhook_events (stripe_customer_id)
  where stripe_customer_id is not null;

comment on column public.stripe_webhook_events.stripe_customer_id is
  'Stripe customer identity captured from webhook payloads for protected reconciliation. Nullable for legacy and non-customer events.';
