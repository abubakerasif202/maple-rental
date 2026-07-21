create table if not exists public.stripe_cancellation_operations (
  id uuid primary key default gen_random_uuid(),
  operation_type text not null check (operation_type in ('application', 'rental')),
  application_id uuid null references public.applications(id) on delete restrict,
  rental_id bigint null references public.rentals(id) on delete restrict,
  stripe_subscription_id text null,
  stripe_checkout_session_id text null,
  expected_payment_link_version integer null check (expected_payment_link_version is null or expected_payment_link_version >= 0),
  requested_mode text not null check (requested_mode in ('immediate', 'period_end')),
  status text not null default 'requested' check (status in ('requested','stripe_processing','stripe_completed','database_completed','reconciliation_pending','completed','failed')),
  idempotency_key text not null unique,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error_code text null,
  requested_by text null,
  requested_at timestamptz not null default now(),
  stripe_completed_at timestamptz null,
  stripe_cancel_at_period_end boolean null,
  stripe_effective_end_at timestamptz null,
  processing_started_at timestamptz null,
  database_completed_at timestamptz null,
  reconciled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((operation_type = 'application' and application_id is not null) or (operation_type = 'rental' and rental_id is not null))
);

create index if not exists stripe_cancellation_operations_incomplete_idx
  on public.stripe_cancellation_operations (status, processing_started_at, requested_at)
  where status not in ('completed', 'failed');
create index if not exists stripe_cancellation_operations_application_idx on public.stripe_cancellation_operations(application_id) where application_id is not null;
create index if not exists stripe_cancellation_operations_rental_idx on public.stripe_cancellation_operations(rental_id) where rental_id is not null;

alter table public.stripe_cancellation_operations enable row level security;
revoke all on public.stripe_cancellation_operations from anon, authenticated;
grant all on public.stripe_cancellation_operations to service_role;

create or replace function public.claim_stripe_cancellation_operation(
  p_operation_id uuid,
  p_stale_before timestamptz
)
returns setof public.stripe_cancellation_operations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  update public.stripe_cancellation_operations
  set status = 'stripe_processing',
      attempt_count = attempt_count + 1,
      processing_started_at = now(),
      last_error_code = null,
      updated_at = now()
  where id = p_operation_id
    and (
      status in ('requested', 'reconciliation_pending', 'failed')
      or (status = 'stripe_processing' and processing_started_at < p_stale_before)
    )
  returning *;
end;
$$;

revoke all on function public.claim_stripe_cancellation_operation(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_stripe_cancellation_operation(uuid, timestamptz) to service_role;
