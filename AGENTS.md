# AGENTS.md — Maple Rentals repository contract

These instructions apply to the whole repository. Maple Rentals is one React/Vite
frontend and Express/TypeScript API, built with npm and deployed as one Render web
service. Supabase provides PostgreSQL, Auth, and private Storage; Stripe provides
hosted subscription Checkout.

## Payment-only invariant

Successful Stripe Checkout records payment only. Every change must preserve all of
these rules:

- Set the application to `Paid` after verified payment.
- Payment-link and Checkout creation must not accept or send `car_id`.
- Signed Checkout tokens must normalize to `carId: null`.
- `Vehicle / Number Plate` remains `applications.approved_vehicle` plain text.
- Do not mutate vehicle state.
- Do not create, update, or activate a rental as Checkout fulfilment.
- Later rental activation is a separate admin-authorized workflow.

Do not weaken this invariant through compatibility paths, retries, webhooks,
background jobs, migrations, tests, or documentation.

The canonical lifecycle and Stripe rules are in
[`docs/architecture/payment-lifecycle.md`](docs/architecture/payment-lifecycle.md).

## Repository sources of truth

- Runtime entry and middleware order: `api/index.ts`
- Application approval/payment links: `api/routes/applications.ts`
- Stripe routes and Checkout construction: `api/routes/stripe.ts`,
  `api/services/stripeCheckoutService.ts`
- Webhook verification and processing: `api/routes/webhooks.ts`,
  `api/services/stripeWebhookService.ts`
- Payment-only write: `api/paymentActivation.ts`
- Admin authorization: `api/middleware/auth.ts`
- Document routes/storage: `api/routes/applications.ts`,
  `api/routes/agreements.ts`, `api/agreementPdfArtifacts.ts`
- Database history: ordered files in `supabase/migrations/`
- Deployment configuration: `render.yaml`
- Security, data access, documents, audit, and accessibility:
  [`docs/security-model.md`](docs/security-model.md)
- Release procedure: [`docs/deployment.md`](docs/deployment.md)

Paths can change. Use `rg --files` and `rg` to locate the current source before
editing; do not add guessed paths or patch `dist/` or `server-dist/`.

## Working rules

1. Confirm `git rev-parse --show-toplevel`, branch, status, and remotes before work.
2. Prefer PowerShell for Windows automation. Read `package.json` and use the
   committed `package-lock.json` with npm.
3. Inspect the relevant route, service, migration, authorization, and tests before
   changing behavior. Identify the root cause before applying a fix.
4. Preserve existing user changes. Make the smallest evidence-backed change and
   avoid unrelated refactors.
5. Validate all untrusted API input server-side. Client state is never authoritative
   for identity, admin role, pricing, payment state, or rental state.
6. Keep secrets and customer identity/payment data out of source, fixtures, logs,
   diffs, and reports.
7. Schema changes must be additive migrations. Never edit, reorder, squash, or
   delete an applied migration. Include preflight, compatibility, recovery, and
   test notes.
8. Do not delete data/files, apply production migrations, rotate secrets, deploy,
   commit, or push without explicit approval. Because `render.yaml` auto-deploys
   `main`, pushing `main` is deployment-affecting. If Git actions are authorized,
   stage only intended files, use a professional commit message, verify the Maple
   remote, and never force-push unless explicitly directed.

## Quality requirements

- PostgreSQL `date` stores date-only business values. `timestamptz` stores exact
  events in UTC. APIs use ISO-8601; Australia/Sydney conversion occurs only at
  business-rule or presentation boundaries and must be DST-safe.
- Privileged routes require server-side authorization. Hidden UI controls are not
  security.
- Customer documents remain private and object-authorized; use short-lived signed
  URLs, validated uploads, retention controls, and access audits.
- Admin/business mutations require append-only, redacted audit events. Where
  practical, mutation and audit event commit in the same transaction.
- Public and admin workflows must support keyboard operation, visible focus,
  accessible names, semantic structure, non-colour status cues, and correct dialog
  and error focus management.

## Verification

Choose checks from the scripts that actually exist in `package.json`. For a normal
code or documentation change, run the relevant targeted tests first, then:

```powershell
npm run lint
npm run test
npm run validate
npm run build
git diff --check
```

`validate` already runs `lint` and `test`; report each command actually run without
implying independence. Run `npm ci` only when a clean dependency install is needed.
Use Node 20.x for release-equivalent results; results on another Node version are
diagnostic and must be labelled.

Every changed business rule needs a targeted regression test. Add RLS/RBAC,
webhook retry/order/concurrency, DST/date, document authorization, audit
immutability, and accessibility coverage when those areas change. Never remove or
weaken a test to get green. Distinguish newly introduced failures from failures
reproduced on the untouched baseline.

## Completion report

For non-trivial work, report:

- summary and root cause;
- changed files and purpose;
- exact commands with PASS/FAIL and runtime versions;
- migrations and deployment impact;
- severity-ranked runtime findings with current file/line evidence;
- remaining risks or blockers; and
- final `git status --short`.

Never claim a test, build, migration, commit, push, or deployment succeeded unless
it ran and succeeded in the current session. Never claim production success without
the evidence required by `docs/deployment.md`.
