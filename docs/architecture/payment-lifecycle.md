# Maple Rentals payment lifecycle

This is the canonical payment contract for Maple Rentals. It describes the current
production workflow and the controls required when changing it.

## Lifecycle and ownership

1. An admin reviews an application and approves a weekly price, date-only intended
   start, plain-text vehicle/number plate, and manual bond state.
2. `api/routes/applications.ts` increments `payment_link_version` and creates a
   signed token normalized to `carId: null`.
3. `api/services/stripeCheckoutService.ts` reloads the application, derives the
   amount from `approved_weekly_price`, and creates Stripe Checkout server-side.
   The client cannot supply price, subscription identity, or `car_id`.
4. Checkout contains one recurring weekly-rental line item. Bond and setup fees are
   not Stripe charges.
5. `api/index.ts` preserves the raw body for `/api/stripe/webhook` before registering
   JSON parsing. `api/routes/webhooks.ts` verifies the Stripe signature.
6. `api/services/stripeWebhookService.ts` claims the event in
   `stripe_webhook_events` and dispatches supported event types.
7. `api/paymentActivation.ts` records `paid_at`, clears the pending Checkout
   session, and sets the application to `Paid`. It does not write a rental or
   vehicle.
8. Any operational rental activation remains a later, explicit, separately
   authorized admin workflow.

## Checkout and subscription safety

- Checkout creation is backend-only. Approved pricing and payment-link version are
  loaded from the database immediately before creation.
- Stripe uses the API version pinned by `STRIPE_API_VERSION` in `api/constants.ts`.
  Update it only with typed SDK, fixture, webhook, and handoff validation.
- The idempotency key must be deterministic from the normalized application ID,
  approved `payment_link_version`/pricing version, and a stable retry seed for a
  confirmed terminal prior session. Random or request-scoped keys are forbidden.
- Reuse a matching open or complete pending Checkout session. A replacement is
  allowed only after Stripe proves the stored session is missing or terminal.
- Application-level existence checks are not sufficient concurrency control.
  Payment schema changes must add a database-enforced uniqueness rule for the
  active application/pricing-version Checkout or subscription intent, plus a
  reviewed terminal-state strategy. Stripe idempotency and advisory locks remain
  additional controls, not substitutes.
- Persist Checkout session, customer, subscription, application, Checkout kind, and
  payment-link version relationships needed for deterministic reconciliation.
- Never log full Stripe objects, payloads, secrets, Checkout URLs, signatures, or
  unnecessary customer/session/subscription identifiers. Log stable internal
  correlation data and redacted error classes.

## Future start dates

`applications.intended_start_date` is a PostgreSQL `date`, represented at API
boundaries as `YYYY-MM-DD`.

- Today/past in Australia/Sydney: omit a future billing anchor. Checkout collects
  the first weekly rental payment immediately.
- Future date: convert local start-of-day in Australia/Sydney to an exact Unix
  timestamp using timezone-aware, DST-safe logic. Set
  `subscription_data.billing_cycle_anchor` to that timestamp and
  `proration_behavior` to `none`; do not use a trial as a scheduling shortcut.
- Future Checkout can complete with `payment_status=no_payment_required` and a
  `$0.00` initial charge. The application stays `Approved`. The first positive
  `invoice.payment_succeeded` at the approved anchor records the application
  `Paid`; a zero-dollar invoice never fulfils it.
- Customer-facing copy must state the first charge date and amount before redirect.
- Cancellation before commencement must use the durable, idempotent cancellation
  operation, cancel the Stripe subscription/session as applicable, and leave the
  application/rental/vehicle invariants intact. No proration or rental activation
  occurs before commencement.

Date-only comparisons are made in Australia/Sydney. Exact Stripe, webhook, payment,
approval, cancellation, and audit events are stored as UTC `timestamptz` and
serialized as ISO-8601 instants.

## Webhook contract

Required event coverage is centralized in `api/stripeWebhookConfig.ts`:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

The ledger contract is:

- `received`: accepted for durable processing;
- `processing`: atomically claimed by one worker;
- `processed`: terminal handling completed, including an explicit non-fulfilment
  result for unsupported or irrelevant events; and
- `failed`: retryable processing failed.

Event ID is unique. Claim, business mutation, fulfilment marker, and terminal ledger
state should complete atomically where one database transaction can cover them.
Transient failures return a retryable error; stale `processing` claims are
reclaimable without rewriting `received_at`. Permanent or business-blocked events
record a redacted classification and terminal non-fulfilment outcome.

Unsupported events must still be recorded as handled/unsupported, never as payment
fulfilment. Duplicate deliveries return success only after confirming the earlier
terminal state. In-flight duplicates remain retryable. Out-of-order subscription
events may update only an already linked rental by exact subscription ID and must
respect the database event watermark; metadata alone cannot select a rental.

## Required regression coverage

Changes in this area require tests for price authority, token normalization,
omission/rejection of `car_id`, deterministic idempotency, concurrent creation,
session replacement, signature/raw-body handling, all ledger transitions, duplicate
and out-of-order events, stale reclaim, future-start DST boundaries, positive versus
zero first invoices, cancellation before start, and the payment-only write set.

## Current implementation follow-up

These controls remain implementation work and are not satisfied by this document:

### Medium

- **No database uniqueness rule owns the active application/pricing-version
  subscription intent.** Checkout creation uses deterministic Stripe idempotency and
  an advisory lock (`api/services/stripeCheckoutService.ts:926-978`), while
  `applications.pending_checkout_session_id` is a nullable field and the persisted
  subscription/Checkout index is non-unique
  (`supabase/migrations/20260715023000_persist_checkout_subscription_relation.sql:7-13`).
  Add an additive intent table/constraint with explicit terminal states; do not
  attach it to rentals or change fulfilment.
- **Webhook claim, payment write, and ledger finalization span separate database
  operations.** Claim is written through the Data API
  (`api/services/stripeWebhookService.ts:479-559`), the payment-only write and
  fulfilment marker use a direct transaction (`api/paymentActivation.ts:228-313`),
  and the ledger is finalized afterward
  (`api/services/stripeWebhookService.ts:918-955`). Existing markers make retries
  safe, but a single transactional completion boundary or durable outbox would make
  state and observability stronger.

### Low

- **The `received` ledger state is defined but normal processing inserts directly
  as `processing`.** See `api/services/stripeWebhookService.ts:482-499`. If receipt
  and claim are separated for queued processing, persist `received` first and test
  the complete state transition.
- **Future-anchor tests do not explicitly cover both Sydney DST boundaries.** Add
  fixed tests around the April and October transitions for the start-of-day Unix
  conversion and first-charge behavior.
