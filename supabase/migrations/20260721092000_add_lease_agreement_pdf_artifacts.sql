create table if not exists public.lease_agreement_pdf_artifacts (
  id uuid primary key default gen_random_uuid(),
  source_agreement_id bigint not null references public.lease_agreements(id) on delete restrict,
  storage_path text null,
  sha256 text null check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint null check (byte_size is null or byte_size > 0),
  mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  template_version integer null,
  generator_version text not null,
  generated_at timestamptz null,
  generation_status text not null default 'pending' check (generation_status in ('pending','generating','ready','failed')),
  failure_code text null,
  generation_started_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_agreement_id)
);
create unique index if not exists lease_agreement_pdf_artifacts_storage_path_idx on public.lease_agreement_pdf_artifacts(storage_path) where storage_path is not null;
alter table public.lease_agreement_pdf_artifacts enable row level security;
revoke all on public.lease_agreement_pdf_artifacts from anon, authenticated;
grant all on public.lease_agreement_pdf_artifacts to service_role;

create or replace function public.claim_lease_agreement_pdf_artifact(
  p_artifact_id uuid,
  p_stale_before timestamptz
)
returns setof public.lease_agreement_pdf_artifacts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  update public.lease_agreement_pdf_artifacts
  set generation_status = 'generating',
      generation_started_at = now(),
      failure_code = null,
      updated_at = now()
  where id = p_artifact_id
    and (
      generation_status in ('pending', 'failed')
      or (generation_status = 'generating' and generation_started_at < p_stale_before)
    )
  returning *;
end;
$$;

revoke all on function public.claim_lease_agreement_pdf_artifact(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_lease_agreement_pdf_artifact(uuid, timestamptz) to service_role;

insert into storage.buckets (id, name, public)
values ('lease-agreements', 'lease-agreements', false)
on conflict (id) do update set public = false;
