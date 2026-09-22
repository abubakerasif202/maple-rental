# Maple Rentals deployment and release safety

This is the release contract for the GitHub connected Vercel project. Vercel
serves the Vite build from `dist` and runs `api/index.ts` as the Node 24 Express
Function. Supabase remains the database, Auth, and private Storage provider.

## Authorization and release identity

Do not deploy, push the configured production branch, apply production
migrations, rotate secrets, or change production data without explicit approval.

Before release:

1. Confirm the repository root, intended diff, branch, Maple `origin`, and Vercel
   project/domain.
2. Record the intended Git commit SHA and local client manifest/asset hashes.
3. Use `package-lock.json` and Node 24.x. The Vercel build command is
   `npm run build`; the frontend output is `dist` and the API Function is
   `api/index.ts`.
4. Run targeted regression tests, `npm run validate`, `npm run build`,
   `npm run check:bundle-budget`, `git diff --check`, and the approved dependency
   audit.

## Vercel runtime contract

- `GET /api/live` is a process/function liveness check.
- `GET /api/health` remains dependency-aware and must not be weakened to hide
  database or payment configuration failures.
- API rewrites run before the SPA fallback.
- The Express Function must not bind a fixed port on Vercel.
- Static files come from Vite's `dist` output. Persistent customer documents and
  generated PDFs remain in private Supabase Storage and are returned through
  short-lived signed URLs.
- Deployment logs must be checked for startup, environment, Function, and build
  errors. Verify the deployed Git commit and production asset identity.

## Migration gate

Migrations are ordered, additive files under `supabase/migrations/`.

- Inspect the complete migration chain and current production migration ledger.
- Run a clean isolated local database reset and schema-contract tests when the
  release changes database-dependent behavior.
- Preflight affected tables, columns, constraints, policies, grants, functions,
  storage buckets/objects, row counts, nulls, duplicates, and compatibility.
- Define backup and recovery before approval. Never run production migrations or
  destructive reset scripts merely because a local check passed.

## Production verification

A release is successful only when current production evidence proves:

- Vercel reports the intended deployment ready for the intended commit SHA;
- served HTML, manifest, and asset hashes match the intended build;
- `GET https://www.maplerentals.com.au/api/live` returns liveness;
- `GET https://www.maplerentals.com.au/api/health` returns dependency-aware health
  with `database: ok`, `directDatabase: ok`, and
  `paymentActivationMode: transactional`;
- public application and read-only authenticated admin smoke checks pass;
- Stripe uses `https://www.maplerentals.com.au/api/stripe/webhook`, the pinned API
  version, and the required events;
- controlled Stripe verification reaches the ledger, records `Paid`, and does not
  create a rental or mutate vehicle state; and
- private document upload, generation, signed URL, and access authorization work.

Do not expose credentials, cookies, customer records, Stripe payloads, or signed
document URLs in release evidence.

## Stop and recovery criteria

Stop rollout or remove traffic when migration/schema checks fail, deployment or
asset identity is wrong, liveness or dependency health fails, authorization or
document privacy regresses, webhook signatures fail, duplicate payable
subscriptions appear, or payment-only fulfilment changes.

Prefer forward repair when payments or append-only records have been accepted.
Otherwise roll back only to a known compatible Vercel deployment, reconcile
Stripe and database state, and preserve audit evidence.

## Evidence report

Separate local validation, Git push, Vercel deployment readiness, migration
application, live health, asset identity, Stripe processing, and document
verification. A green health endpoint or successful push alone is not deployment
proof.
