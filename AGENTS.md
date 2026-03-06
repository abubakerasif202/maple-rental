# AGENTS.md

This file documents agent-facing workflows and commands for this repository.

## Local Developer Commands

Use these from the repository root:

- Install dependencies: `npm ci` (or `npm install`)
- Start local app server: `npm run dev`
- Start app (same entry as dev): `npm run start`
- Build production assets: `npm run build`
- Preview build: `npm run preview`
- Type-check: `npm run lint`
- Clean build output: `npm run clean`

Script safety notes:

- `scripts/check-status.js` and `scripts/pg-seed.js` require `SUPABASE_DB_URL` (or `DATABASE_URL`).
- `scripts/pg-seed.js` is destructive and requires `ALLOW_SCHEMA_RESET=true`.
- `scripts/seed-admin.js` and `scripts/reset-admin.js` require explicit admin credentials via args or env.

## GitHub Agent Workflows

Primary dispatcher:

- `.github/workflows/gemini-dispatch.yml`

Called workflows:

- `.github/workflows/gemini-review.yml`
- `.github/workflows/gemini-triage.yml`
- `.github/workflows/gemini-invoke.yml`
- `.github/workflows/gemini-plan-execute.yml`
- `.github/workflows/gemini-scheduled-triage.yml`

## Trigger Routing (`gemini-dispatch`)

The dispatcher accepts issue/PR events and routes by command:

- PR opened -> `review`
- Issue opened/reopened -> `triage`
- Comment starting with `@gemini-cli /review` -> `review`
- Comment starting with `@gemini-cli /triage` -> `triage`
- Comment starting with `@gemini-cli /approve` -> `plan-execute`
- Comment starting with `@gemini-cli` (anything else) -> `invoke`

Notes:

- Command comments are only honored for `OWNER`, `MEMBER`, or `COLLABORATOR`.
- PR events are ignored when the PR comes from a fork.

## Command Prompt Files

Workflow prompt definitions live in:

- `.github/commands/gemini-review.toml`
- `.github/commands/gemini-triage.toml`
- `.github/commands/gemini-invoke.toml`
- `.github/commands/gemini-plan-execute.toml`
- `.github/commands/gemini-scheduled-triage.toml`

These define each agent's behavior and output contract.

## Operational Flow

1. A user opens an issue/PR or comments with `@gemini-cli ...`.
2. `gemini-dispatch` acknowledges and routes to the correct reusable workflow.
3. The target workflow runs Gemini CLI with restricted tool settings.
4. For `/approve`, the `gemini-plan-execute` workflow performs implementation actions (write-enabled permissions).

## Required Repository Configuration

These workflows expect repository/org configuration to be present:

- Variables: `APP_ID`, `GOOGLE_CLOUD_LOCATION`, `GOOGLE_CLOUD_PROJECT`, `SERVICE_ACCOUNT_EMAIL`, `GCP_WIF_PROVIDER`, `GEMINI_CLI_VERSION`, `GEMINI_MODEL`, `GOOGLE_GENAI_USE_GCA`, `GOOGLE_GENAI_USE_VERTEXAI`, `UPLOAD_ARTIFACTS`
- Secrets: `APP_PRIVATE_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`

Without these values, workflows may fail to mint identity tokens or run Gemini CLI.