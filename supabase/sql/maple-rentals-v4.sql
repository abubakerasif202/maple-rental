create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.drivers
    where auth_user_id = auth.uid()
      and role = 'admin'
  );
$$;

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  make text not null,
  model text not null,
  year integer not null check (year >= 2000),
  plate_number text not null unique,
  vin text unique,
  color text,
  category text,
  weekly_rate numeric(10, 2) not null check (weekly_rate > 0),
  bond_amount numeric(10, 2) not null check (bond_amount >= 0),
  image_url text,
  status text not null default 'available' check (status in ('available', 'reserved', 'active', 'maintenance', 'inactive')),
  features jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  phone text,
  license_number text not null unique,
  role text not null default 'driver' check (role in ('driver', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'active', 'suspended', 'disabled')),
  stripe_customer_id text unique,
  current_vehicle_id uuid references public.vehicles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  application_id uuid,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  storage_bucket text not null default 'contracts',
  storage_path text not null unique,
  file_name text not null,
  status text not null default 'issued' check (status in ('draft', 'issued', 'signed', 'archived')),
  issued_at timestamptz not null default timezone('utc', now()),
  signed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  contract_id uuid unique references public.contracts(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'checkout_pending', 'subscribed', 'cancelled')),
  experience_years integer not null default 0 check (experience_years >= 0),
  preferred_start_date date,
  notes text,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  rejection_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.contracts
  add constraint contracts_application_id_fkey
  foreign key (application_id) references public.applications(id) on delete set null;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  application_id uuid not null unique references public.applications(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_checkout_session_id text unique,
  status text not null default 'draft' check (status in ('draft', 'checkout_pending', 'trialing', 'active', 'past_due', 'unpaid', 'canceled')),
  weekly_rate numeric(10, 2) not null check (weekly_rate >= 0),
  bond_amount numeric(10, 2) not null check (bond_amount >= 0),
  billing_anchor timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  last_invoice_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  stripe_invoice_id text not null unique,
  stripe_payment_intent_id text,
  amount numeric(10, 2) not null check (amount >= 0),
  currency text not null default 'aud',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded')),
  paid_at timestamptz,
  failure_message text,
  retry_count integer not null default 0,
  next_retry_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references public.drivers(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  amount numeric(10, 2) not null check (amount >= 0),
  currency text not null default 'aud',
  status text not null default 'scheduled' check (status in ('scheduled', 'paid', 'failed')),
  scheduled_for timestamptz,
  paid_at timestamptz,
  reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references public.drivers(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms', 'in_app')),
  template_key text not null,
  subject text,
  body text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  sent_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_vehicles_status on public.vehicles(status);
create index if not exists idx_drivers_status on public.drivers(status);
create index if not exists idx_drivers_current_vehicle on public.drivers(current_vehicle_id);
create index if not exists idx_applications_driver_status on public.applications(driver_id, status);
create index if not exists idx_applications_vehicle_status on public.applications(vehicle_id, status);
create index if not exists idx_subscriptions_driver_status on public.subscriptions(driver_id, status);
create index if not exists idx_subscriptions_vehicle_status on public.subscriptions(vehicle_id, status);
create index if not exists idx_payments_driver_status on public.payments(driver_id, status);
create index if not exists idx_payments_retry on public.payments(status, next_retry_at);
create index if not exists idx_notifications_driver_created on public.notifications(driver_id, created_at desc);
create index if not exists idx_contracts_driver_created on public.contracts(driver_id, created_at desc);

drop trigger if exists set_vehicles_updated_at on public.vehicles;
create trigger set_vehicles_updated_at before update on public.vehicles for each row execute function public.set_updated_at();
drop trigger if exists set_drivers_updated_at on public.drivers;
create trigger set_drivers_updated_at before update on public.drivers for each row execute function public.set_updated_at();
drop trigger if exists set_contracts_updated_at on public.contracts;
create trigger set_contracts_updated_at before update on public.contracts for each row execute function public.set_updated_at();
drop trigger if exists set_applications_updated_at on public.applications;
create trigger set_applications_updated_at before update on public.applications for each row execute function public.set_updated_at();
drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();
drop trigger if exists set_payments_updated_at on public.payments;
create trigger set_payments_updated_at before update on public.payments for each row execute function public.set_updated_at();
drop trigger if exists set_payouts_updated_at on public.payouts;
create trigger set_payouts_updated_at before update on public.payouts for each row execute function public.set_updated_at();
drop trigger if exists set_notifications_updated_at on public.notifications;
create trigger set_notifications_updated_at before update on public.notifications for each row execute function public.set_updated_at();

alter table public.vehicles enable row level security;
alter table public.drivers enable row level security;
alter table public.applications enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.payouts enable row level security;
alter table public.contracts enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "public can view vehicles" on public.vehicles;
create policy "public can view vehicles"
on public.vehicles
for select
using (true);

drop policy if exists "admins manage vehicles" on public.vehicles;
create policy "admins manage vehicles"
on public.vehicles
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "drivers view self" on public.drivers;
create policy "drivers view self"
on public.drivers
for select
using (auth.uid() = auth_user_id or public.is_admin());

drop policy if exists "drivers update self" on public.drivers;
create policy "drivers update self"
on public.drivers
for update
using (auth.uid() = auth_user_id or public.is_admin())
with check (auth.uid() = auth_user_id or public.is_admin());

drop policy if exists "drivers insert self" on public.drivers;
create policy "drivers insert self"
on public.drivers
for insert
with check (auth.uid() = auth_user_id or public.is_admin());

drop policy if exists "applications owner access" on public.applications;
create policy "applications owner access"
on public.applications
for select
using (
  exists (
    select 1
    from public.drivers
    where drivers.id = applications.driver_id
      and (drivers.auth_user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "applications owner insert" on public.applications;
create policy "applications owner insert"
on public.applications
for insert
with check (
  exists (
    select 1
    from public.drivers
    where drivers.id = applications.driver_id
      and (drivers.auth_user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "applications admin update" on public.applications;
create policy "applications admin update"
on public.applications
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "subscriptions owner read" on public.subscriptions;
create policy "subscriptions owner read"
on public.subscriptions
for select
using (
  exists (
    select 1 from public.drivers
    where drivers.id = subscriptions.driver_id
      and (drivers.auth_user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "subscriptions admin write" on public.subscriptions;
create policy "subscriptions admin write"
on public.subscriptions
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "payments owner read" on public.payments;
create policy "payments owner read"
on public.payments
for select
using (
  exists (
    select 1 from public.drivers
    where drivers.id = payments.driver_id
      and (drivers.auth_user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "payments admin write" on public.payments;
create policy "payments admin write"
on public.payments
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "payouts owner read" on public.payouts;
create policy "payouts owner read"
on public.payouts
for select
using (
  driver_id is null
  or exists (
    select 1 from public.drivers
    where drivers.id = payouts.driver_id
      and (drivers.auth_user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "payouts admin write" on public.payouts;
create policy "payouts admin write"
on public.payouts
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "contracts owner read" on public.contracts;
create policy "contracts owner read"
on public.contracts
for select
using (
  exists (
    select 1 from public.drivers
    where drivers.id = contracts.driver_id
      and (drivers.auth_user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "contracts admin write" on public.contracts;
create policy "contracts admin write"
on public.contracts
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "notifications owner read" on public.notifications;
create policy "notifications owner read"
on public.notifications
for select
using (
  driver_id is null
  or exists (
    select 1 from public.drivers
    where drivers.id = notifications.driver_id
      and (drivers.auth_user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "notifications admin write" on public.notifications;
create policy "notifications admin write"
on public.notifications
for all
using (public.is_admin())
with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', false)
on conflict (id) do nothing;

drop policy if exists "contracts bucket read" on storage.objects;
create policy "contracts bucket read"
on storage.objects
for select
using (
  bucket_id = 'contracts'
  and (
    public.is_admin()
    or exists (
      select 1
      from public.contracts
      join public.drivers on drivers.id = contracts.driver_id
      where contracts.storage_path = storage.objects.name
        and drivers.auth_user_id = auth.uid()
    )
  )
);

drop policy if exists "contracts bucket admin write" on storage.objects;
create policy "contracts bucket admin write"
on storage.objects
for all
using (bucket_id = 'contracts' and public.is_admin())
with check (bucket_id = 'contracts' and public.is_admin());
