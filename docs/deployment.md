# Maple Rentals deployment and release safety

This is the release contract. `render.yaml` is the configuration source of truth;
`DEPLOY_RENDER.md` contains Render setup details.

## Authorization and release identity

Do not deploy, push `main`, apply production migrations, rotate secrets, or change
production data without explicit approval. Render has
`autoDeployTrigger: commit`, so a push to `main` can deploy.

Before release:

1. Confirm repository root, clean/intended diff, branch, Maple `origin`, and target
   Render service/domain.
2. Record the intended Git commit SHA and local client manifest/asset hashes.
3. Use npm with `package-lock.json` and Node 20.x. The Render build is
   `npm ci --include=dev && npm run validate && npm run build`; start is
   `npm start`.
4. Run targeted regression tests, `npm run validate`, `npm run build`,
   `npm run check:bundle-budget`, `git diff --check`, and the production dependency
   audit used by CI: `npm audit --omit=dev --audit-level=moderate`.

## Migration gate

Migrations are ordered, additive files under `supabase/migrations/`.

- Inspect the complete migration chain and current production migration ledger.
- Run a clean isolated `supabase db reset --local` and schema-contract tests.
- Preflight affected tables, columns, constraints, policies, grants, functions,
  storage buckets/objects, row counts, nulls, duplicates, and application-version
  compatibility.
- Choose migration-first, code-first, or expand/migrate/contract ordering so both
  old and new application versions remain safe during rollout.
- Define backup and recovery before approval. Verify a logical database backup when
  data/schema risk warrants it; back up Storage separately.
- Prefer forward recovery for additive changes. Rollback is allowed only when the
  old binary and schema remain compatible and no accepted payment/audit/document
  event would be lost or reprocessed.
- Never run destructive reset scripts, ad hoc SQL, or production migrations merely
  because a local check passed.

## Production verification

A release is successful only when current production evidence proves:

- Render reports the deployment ready for the intended commit SHA;
- the served HTML/manifest asset hash matches the intended build;
- `GET https://www.maplerentals.com.au/api/live` returns liveness;
- `GET https://www.maplerentals.com.au/api/health` returns dependency-aware health
  with `database: ok`, `directDatabase: ok`, and
  `paymentActivationMode: transactional`;
- the production migration ledger/schema contract matches the release;
- the public application and read-only authenticated admin smoke checks pass;
- Stripe webhook configuration uses the canonical URL, pinned API version, and
  required events;
- a controlled Stripe test-mode/safe verification event reaches the ledger, moves
  through the expected state, and does not create a rental or mutate vehicle state;
  and
- configured background/cron jobs have the intended command, environment,
  schedule, last successful execution, alerting, and idempotent recovery. If no job
  is configured, report it as not applicable.

Do not expose credentials, cookies, customer records, Stripe payloads, or signed
document URLs in release evidence.

## Stop and recovery criteria

Stop rollout or remove traffic when any of these occurs:

- migration preflight/schema contract fails or deployed schema is ambiguous;
- production asset/commit identity does not match;
- liveness fails, health is non-200/degraded, or payment activation is restricted;
- admin authorization, RLS, document privacy, or secret handling regresses;
- webhook signatures fail, events remain stuck/retry repeatedly, duplicate payable
  subscriptions appear, or payment-only fulfilment changes;
- error rate, latency, or data-integrity signals exceed the reviewed release
  threshold.

Prefer forward repair when payments or append-only records have been accepted.
Otherwise roll back only to a known compatible saved deployment, pause affected
webhook/worker actions if safe, reconcile Stripe/database state, and preserve audit
evidence. Report the incident and unresolved reconciliation explicitly.

## Evidence report

Separate local validation, Git push, Render readiness, migration application, live
health, asset identity, Stripe processing, and job verification. A green health
endpoint or successful push alone is not deployment proof.
