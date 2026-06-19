# Stripe System V2

This document is the V2 baseline reference. The active operational handoff for the current code is [`docs/stripe-system-v3.md`](./stripe-system-v3.md).

## Overview

Stripe System V2 is the vehicle-payment path for Gala Rentals. It creates hosted Stripe Checkout Sessions, receives verified Stripe webhooks, and turns a paid checkout into an application, rental, and car state transition.

The key design rule is simple: the success page is informational, but webhook-confirmed state is authoritative for final payment success.

## Source of truth

| Concern | Source of truth | Notes |
|---|---|---|
| Final payment success | `POST /api/stripe/webhook` after Stripe signature verification | This is the only authoritative source for "paid and fulfilled". |
| Checkout session creation and reuse | `api/routes/stripe.ts` | Creates or reuses hosted Checkout Sessions and persists `pending_checkout_session_id`. |
| Application payment state transitions | `api/applicationPaymentState.ts` | Version-gated writes prevent stale payment links from overwriting newer state. |
| Fulfillment and repair writes | `api/paymentActivation.ts` | Owns the checkout-to-rental activation transaction and fulfillment marker. |
| Webhook dispatch and retry policy | `api/services/stripeWebhookService.ts` | Owns ledger claims, replay handling, and retry classification. |

## End-to-end payment flow

1. Admin approval creates a signed payment link and increments `payment_link_version`.
2. The client calls `POST /api/stripe/vehicle-checkout-session`.
3. The server validates the checkout token, vehicle assignment, application status, and current payment-link version.
4. The server reuses an open Checkout Session when the stored `pending_checkout_session_id` still matches the same application, car, and version.
5. If reuse is not possible, the server creates a new hosted Checkout Session and stores the new `pending_checkout_session_id` only if the application version still matches.
6. Stripe redirects the customer to the hosted checkout and then back to `/success`.
7. The success page polls `GET /api/stripe/checkout-sessions/:sessionId` for display only.
8. Stripe sends a verified webhook event.
9. The webhook service claims the event in the ledger, dispatches it, and calls the activation path for paid vehicle checkouts.
10. The activation transaction writes the rental, car, application, and fulfillment marker together.
11. Once the webhook ledger is finalized, the application is considered truly paid.

## Checkout/session creation flow

`api/routes/stripe.ts` is still the main orchestration surface for checkout creation.

| Step | Behavior |
|---|---|
| Request validation | Requires `application_id`, `car_id`, and `checkout_token`. |
| Payment-link version check | Rejects stale or mismatched versions before creating a session. |
| Approval gate | Only approved applications with the correct assigned car can proceed. |
| Vehicle gate | The selected car must still be available and not conflict with another live allocation. |
| Session reuse | If `pending_checkout_session_id` still resolves to an open or complete Stripe session for the same application/car/version, that session is reused. |
| New session creation | Hosted Checkout Session is created in `subscription` mode with metadata for application id, car id, checkout kind, pricing, and payment-link version. |
| Idempotency | New sessions use a deterministic idempotency key derived from application id, payment-link version, and any retry seed. |
| Persistence | The new session id is saved back to the application only if the row is still on the same payment-link version. |
| Failure handling | If persistence fails after session creation, the new Stripe session is expired and the client is told to reload the latest payment link. |

## Success page behavior and why it is non-authoritative

`GET /api/stripe/checkout-sessions/:sessionId` is a status read, not a payment truth source.

The success page can show:

- `open` when Stripe has not completed the session.
- `pending` when Stripe completed the session but application fulfillment is still in progress.
- `manual_review` when Stripe confirmed payment but activation could not complete automatically.
- `complete` only when the application is already `Paid` and a live rental exists.

The page is non-authoritative because it can observe Stripe session state before the webhook has run, before the transaction commits, or while a replay is still being processed. Final success must come from the webhook-confirmed path.

## Webhook verification and processing flow

`api/routes/webhooks.ts` is intentionally thin:

1. Require `STRIPE_WEBHOOK_SECRET`.
2. Read the Stripe signature header.
3. Verify and construct the event with the Stripe SDK.
4. Hand off the verified event to `processStripeWebhookEvent()` in `api/services/stripeWebhookService.ts`.

`api/services/stripeWebhookService.ts` owns the operational behavior:

- Claims the webhook event in `stripe_webhook_events`.
- Detects duplicate deliveries and already-processed events.
- Reclaims stale in-flight claims after the processing window.
- Dispatches event-specific handlers.
- Finalizes the ledger outcome as `processed` or `failed`.
- Classifies failures as `transient`, `permanent`, or `business_blocked`.

If the event is already processed, the handler returns `200`.
If the event is still in flight, the handler returns `409`.
If a transient error occurs after claiming the event, the handler returns `500` so Stripe retries.

## Webhook ledger lifecycle

The preferred ledger format is the modern `stripe_webhook_events` schema:

| Field | Purpose |
|---|---|
| `stripe_event_id` | Unique stable identifier for the Stripe delivery or synthetic fulfillment marker. |
| `event_type` | Original Stripe event type, or the fulfillment marker type. |
| `status` | `received`, `processing`, `processed`, or `failed`. |
| `received_at` | Processing timestamp used for stale-claim recovery. |
| `processed_at` | Finalization timestamp. |
| `error_message` | Captures retry classification and error text for terminal outcomes. |

Lifecycle:

1. Insert a row in `processing` state when the event is first claimed.
2. If another worker already owns the row, return `409` while it is active.
3. If the same event has already been finalized, return `200` without reprocessing.
4. If the claim is stale, reclaim it and continue.
5. After handler success, mark the row `processed`.
6. On transient failure, mark the row `failed` and let Stripe retry.
7. On permanent or business-blocked failure, mark the row `processed` with classification details and return `200`.

The service still supports a legacy ledger shape when the modern columns are missing. That fallback exists only for compatibility.

## Retry classification

| Classification | When it is used | Ledger outcome | HTTP outcome | Stripe retry? |
|---|---|---|---|---|
| `transient` | Stripe/API connection errors, 5xx responses, timeouts, temporary network failures | `failed` | `500` | Yes |
| `permanent` | Invalid input, missing stable ids, signature issues, not-found style errors | `processed` with `permanent:` prefix | `200` | No |
| `business_blocked` | Allocation conflicts, stale payment-link versions, manual-review blockers, activation state conflicts | `processed` with `business_blocked:` prefix | `200` | No |

This policy is intentional: only infrastructure-like failures should keep retrying. Business blockers should be recorded, not retried forever.

## Fulfillment idempotency model

Vehicle checkout fulfillment uses a durable marker so the same Stripe session cannot activate twice.

Marker details:

- Marker id format: `fulfill:vehicle-checkout:<checkout_session_id>`
- Marker event type: `vehicle_checkout.fulfillment.processed`
- Storage: `stripe_webhook_events`

Why it reuses `stripe_webhook_events`:

- The ledger already has a unique constraint on `stripe_event_id`.
- Reusing the table avoids a second schema and lets the marker participate in the same transaction as the activation writes.
- It is a pragmatic durability layer until a dedicated fulfillment table becomes worthwhile.

How it works:

1. `handleVehicleCheckoutCompletion()` acquires the application-level advisory lock.
2. The transaction checks whether the fulfillment marker already exists.
3. If the marker exists, the handler returns `already_fulfilled` and skips the writes.
4. If the marker does not exist, the transaction performs the rental, car, and application updates.
5. The marker is written last, inside the same transaction.

This closes the duplicate-activation path for replayed webhooks and for retries after a partial finalization failure.

The important failure case is: side effects committed, finalization failed.

- Side effects means the rental row, car status, and application status already changed.
- Finalization failed means the outer webhook handler crashed or could not mark the webhook ledger as processed.
- On replay, the fulfillment marker is still present, so the activation path short-circuits instead of applying the same checkout again.

## Application, rental, and car state transitions

| Trigger | Application | Rental | Car | Notes |
|---|---|---|---|---|
| Paid vehicle checkout completes cleanly | `Paid` | `Active` | `Rented` | Normal success path. |
| Paid checkout hits a blocker | `Payment Review` | unchanged or repaired later | unchanged | Stripe payment is confirmed, but fulfillment was blocked. |
| `checkout.session.expired` | pending session cleared if version still matches | unchanged | unchanged | Only clears current-version pending session state. |
| `checkout.session.async_payment_failed` | pending session cleared if version still matches | unchanged | unchanged | Cleanup only. |
| `invoice.payment_failed` | unchanged | `Overdue` | unchanged | Subscription lifecycle path. |
| `customer.subscription.updated` to `past_due` or `unpaid` | unchanged | `Overdue` | unchanged | Subscription lifecycle path. |
| `customer.subscription.updated` to `active` | unchanged | `Active` | unchanged | Subscription lifecycle path. |
| `customer.subscription.deleted` with cancellation requested | unchanged | `Completed` | may become `Available` if no other live rental exists | Vehicle is released only when it is safe to do so. |
| `customer.subscription.deleted` without voluntary cancellation | unchanged | `Cancelled` | unchanged | Car stays rented if any live rental remains. |

`api/applicationPaymentState.ts` protects the application row with version-gated writes so stale payment links do not rewrite newer state.

## Concurrency controls and advisory locking

Concurrency is handled at multiple layers:

- `withVehicleCheckoutProcessingLock()` serializes checkout activation per application when a direct Postgres connection is available.
- `buildLockedApplicationSelectSql()` reads the application row `FOR UPDATE` and aliases schema variants back to stable field names.
- The activation flow also locks the car row `FOR UPDATE` before checking availability.
- The webhook ledger claim prevents two workers from processing the same Stripe event at the same time.
- Version checks on the application row prevent an older payment link from activating a newer approval.

These locks are intentionally redundant. The system is designed to fail closed under replay, race, and stale-link conditions.

## Failure scenarios and replay behavior

| Scenario | Result |
|---|---|
| Duplicate Stripe delivery with the same event id | Ledger sees `processed` and returns `200` without re-running the handler. |
| Duplicate delivery while another worker owns the event | Ledger returns `409` while the claim is active. |
| Stale in-flight ledger row older than the processing window | Claim is reclaimed and processing continues. |
| Transient downstream failure during webhook handling | Ledger becomes `failed`, webhook returns `500`, Stripe retries. |
| Permanent or business-blocked failure during webhook handling | Ledger becomes `processed` with classification details, webhook returns `200`, Stripe stops retrying. |
| Replay after side effects committed but ledger finalization failed | Fulfillment marker prevents duplicate activation. |
| Success page shows `pending` before webhook finalizes | This is expected and not a failure. |
| Payment-review replay of the same session | The same session can be replayed to finish activation, but a different session id will not be accepted as the same payment. |

## Operational notes / troubleshooting

- Webhook endpoint requires `STRIPE_WEBHOOK_SECRET`; without it, `/api/stripe/webhook` returns `503`.
- If automatic activation is unavailable because the deployment lacks a session-capable Postgres connection, successful payments intentionally fall back to `Payment Review`.
- `Payment Review` means Stripe confirmed payment, but the application still needs manual or replay-based completion.
- `GET /api/stripe/checkout-sessions/:sessionId` is useful for operator diagnosis, but it is not the final payment authority.
- If a checkout session cannot be reused, the server intentionally creates a new session only after verifying the current payment-link version.
- The webhook service still has legacy ledger compatibility code. Treat that as support code, not the preferred path.
- I did not find a post-fix green rerun of the focused Stripe suite in the current repo/worklog during this pass, so treat that verification as unconfirmed here.

## Known limitations

- `api/routes/stripe.ts` is still thicker than ideal. It is the next extraction target.
- Fulfillment markers currently reuse `stripe_webhook_events` instead of a dedicated table.
- The service still carries legacy ledger compatibility logic.
- Success page state can lag behind webhook state by design.
- The webhook and activation path is robust, but the manual-review fallback still depends on operational discipline.
- The focused Stripe test suite needs a fresh verified rerun before anyone should call the post-fix state fully revalidated.

## Recommended next steps

1. Extract checkout-session creation, reuse, and status lookup out of `api/routes/stripe.ts`.
2. Move fulfillment markers into a dedicated table once schema work is acceptable.
3. Re-run the focused Stripe tests and then the broader validation suite.
4. Keep webhook-confirmed paid state as the only authoritative final success signal.
5. Preserve the current replay and stale-link guards when refactoring the payment path.
