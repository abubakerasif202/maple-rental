# Stripe System V3

Stripe System V3 is the current Gala Rentals Stripe architecture. It preserves the V2 correctness guarantees while making checkout orchestration thinner, webhook processing queue-ready, and replay/debug behavior easier to operate under load.

## Overview

V3 keeps the same payment truth model as V2:

- Webhook-confirmed state is authoritative for final payment success.
- The success page is informational only.
- Fulfillment remains idempotent.
- Webhook retries are still classified as `transient`, `permanent`, or `business_blocked`.

The V3 change is structural, not semantic:

- `api/routes/stripe.ts` is now a thin HTTP adapter.
- Checkout orchestration lives in `api/services/stripeCheckoutService.ts`.
- Webhook verification and processing live in `api/services/stripeWebhookService.ts`.
- Webhook ledger rows now carry more operational metadata so the same code path can run inline today and in a worker later.

## V2 baseline

V2 already established the following guarantees:

| Guarantee | Current behavior |
|---|---|
| Final payment truth | The webhook-confirmed path is authoritative. |
| Replay safety | Duplicate webhook deliveries do not create duplicate fulfillment. |
| Fulfillment idempotency | Vehicle checkout fulfillment is protected by a marker record. |
| Stale write protection | Payment activation uses version-gated writes. |
| Concurrency control | Advisory locking protects activation against concurrent processing. |
| Retry model | Failures are classified into transient, permanent, and business-blocked outcomes. |

V3 does not remove any of those guarantees. It makes them easier to reason about and safer to operate.

## Source of truth

| Concern | Authoritative source | Notes |
|---|---|---|
| Final payment success | `POST /api/stripe/webhook` after Stripe signature verification | This is the only authoritative source of final success. |
| Checkout orchestration | `api/services/stripeCheckoutService.ts` | Handles creation, reuse, and status lookup. |
| Webhook processing | `api/services/stripeWebhookService.ts` | Handles claim/dedupe, dispatch, retry classification, and ledger finalization. |
| Fulfillment writes | `api/paymentActivation.ts` | Owns the activation transaction and fulfillment marker. |
| Application payment state | `api/applicationPaymentState.ts` | Version-gated writes prevent stale payment links from overwriting newer state. |
| Webhook ledger | `stripe_webhook_events` | Stores the event claim, processing state, fulfillment state, and retry metadata. |

## End-to-end payment flow

1. Admin approval creates a signed payment link and increments `payment_link_version`.
2. The customer starts checkout from the payment link.
3. `api/services/stripeCheckoutService.ts` validates the application, car, and checkout token.
4. The service reuses an open Stripe Checkout Session when the stored `pending_checkout_session_id` still matches the current application, car, and version.
5. If reuse is not possible, the service creates a new hosted Checkout Session and persists the session id only if the application is still on the same payment-link version.
6. Stripe redirects the customer to the hosted Checkout Session and then back to `/success`.
7. The success page polls `GET /api/stripe/checkout-sessions/:sessionId` for display only.
8. Stripe sends a verified webhook event.
9. `api/services/stripeWebhookService.ts` claims the event in `stripe_webhook_events`, dispatches the event, and hands paid vehicle checkouts to `api/paymentActivation.ts`.
10. `api/paymentActivation.ts` performs the activation transaction and writes the fulfillment marker.
11. The webhook ledger is finalized with a processing result and replay classification.

## Checkout/session creation flow

`api/routes/stripe.ts` now only parses the request, maps errors, and delegates. The actual behavior lives in `api/services/stripeCheckoutService.ts`.

### Service responsibilities

| Step | Behavior |
|---|---|
| Payment context loading | Reads application, car, billing, and agreement data needed for checkout. |
| Session reuse | Reuses a live Checkout Session when the stored session is still valid for the current application/version/car. |
| Session creation | Creates a Stripe Checkout Session in `subscription` mode with the correct metadata and URLs. |
| Idempotency | Uses a deterministic idempotency key derived from application id, payment-link version, and retry seed. |
| Persistence | Stores `pending_checkout_session_id` only if the application row still matches the current version. |
| Expiry cleanup | Expires a newly created Stripe session if persistence loses the version race. |
| Status lookup | Returns Stripe session status plus local application/rental state for the success page. |

### What still sits in the route

`api/routes/stripe.ts` still owns:

- HTTP validation
- request/response shaping
- Stripe SDK error-to-HTTP mapping
- auth checks for admin-only link generation

That is intentional. It keeps the route thin without forcing a larger transport refactor.

## Success page behavior and why it is non-authoritative

`GET /api/stripe/checkout-sessions/:sessionId` is a status read, not a source of truth.

The success page can show:

| Internal status | Meaning |
|---|---|
| `open` | Stripe has not completed the session. |
| `pending` | Stripe completed the session but local fulfillment has not finished yet. |
| `manual_review` | Stripe confirmed payment, but activation could not complete automatically. |
| `complete` | The application is paid and a live rental exists. |

The page is non-authoritative because it can run before the webhook executes, while the activation transaction is still in progress, or during replay after a restart. Final payment success must still come from the webhook-confirmed path.

## Webhook verification and processing flow

`api/routes/webhooks.ts` is intentionally thin:

1. Require `STRIPE_WEBHOOK_SECRET`.
2. Read the Stripe signature header.
3. Verify and construct the Stripe event with the SDK.
4. Hand the verified event to `processStripeWebhookEvent()`.

`api/services/stripeWebhookService.ts` now has a queue-ready boundary:

- `buildStripeWebhookWorkItem(event)` converts the verified Stripe event into a serializable work item.
- `processStripeWebhookWorkItem(workItem, event)` is the core processing path.
- `processStripeWebhookEvent(event)` is the current inline entrypoint.

That split means the same worker logic can be reused later if a real queue is added. The code does not pretend a queue exists today.

### Processing stages

| Stage | Responsibility |
|---|---|
| Verified parsing | Normalize the Stripe event into a deterministic work item. |
| Claim / dedupe | Insert or reclaim the ledger row for the event. |
| Classification | Distinguish retryable, terminal, and business-blocked failures. |
| Dispatch | Route the event to checkout fulfillment or subscription lifecycle handling. |
| Fulfillment | Call activation and replay-safe fulfillment markers when needed. |
| Finalization | Mark the ledger row as processed or failed with structured outcome data. |

## Webhook ledger lifecycle

The ledger remains `stripe_webhook_events`. V3 reuses the same table instead of adding a separate queue table because the current repository already relies on it as the durable idempotency record and the fulfillment marker store.

### Current columns used by V3

| Column | Purpose |
|---|---|
| `stripe_event_id` | Idempotency key for the Stripe event or synthetic fulfillment marker. |
| `event_type` | Stripe event type, or a legacy processing marker. |
| `status` | `received`, `processing`, `processed`, or `failed`. |
| `application_id` | Observability and correlation. |
| `car_id` | Observability and correlation. |
| `checkout_kind` | Checkout category, usually `vehicle`. |
| `checkout_session_id` | The Stripe Checkout Session id for checkout events. |
| `payment_link_version` | Version correlation for stale-link debugging. |
| `processing_source` | `webhook-route` today, `queue-worker` later. |
| `fulfillment_state` | Outcome of the fulfillment side effect. |
| `retry_count` | Processing counter. |
| `retry_reason` | Terminal or retryable failure reason. |
| `error_message` | Raw failure text when processing fails. |

### Lifecycle

| State | Meaning |
|---|---|
| `received` | Event has been persisted but not yet claimed for work. |
| `processing` | A worker or route instance owns the event claim. |
| `processed` | Event completed successfully or ended in a terminal non-retryable state. |
| `failed` | Event failed in a retryable way and should be retried by Stripe or the operator. |

### Claim behavior

- New events are inserted with `status = processing`.
- Duplicate deliveries read the existing row and decide whether the event is already processed, still in flight, or safe to reclaim after a stale window.
- The stale claim window is five minutes.
- Legacy compatibility remains in the code path, but the modern ledger shape is the active path.

## Retry classification

`classifyWebhookProcessingError()` returns one of three classes.

| Class | Meaning | Operator action |
|---|---|---|
| `transient` | Temporary infrastructure or Stripe failure. | Leave it retryable. Stripe or the caller should replay it. |
| `permanent` | Bad input, missing data, or a non-retryable validation issue. | Mark the event terminal and investigate the data issue. |
| `business_blocked` | Payment is real, but automatic fulfillment cannot safely continue. | Mark the event terminal and review the business condition manually. |

### Terminal handling

- `transient` -> ledger `failed`, processing throws, Stripe retry remains possible.
- `permanent` -> ledger `processed`, no retry expected.
- `business_blocked` -> ledger `processed`, no retry expected, manual review required.

## Fulfillment idempotency model

Vehicle checkout fulfillment is still idempotent and still protected by the fulfillment marker.

### Marker design

- Marker id format: `fulfill:vehicle-checkout:<checkout_session_id>`
- Storage: `stripe_webhook_events`
- Purpose: record that the activation transaction already completed for that checkout session

### Why it reuses `stripe_webhook_events`

The current repo already treats `stripe_webhook_events` as the durable webhook ledger. Reusing it for the marker avoids introducing a second table or a fake queue abstraction before the processing model itself changes.

### Side effect happened, finalization failed

This is the important failure mode V3 is designed to tolerate:

1. The activation transaction succeeds and performs the side effect.
2. The process fails before the webhook ledger is finalized.
3. Stripe retries the event.
4. The replay sees the fulfillment marker and skips the side effect.

That gives us exactly-once side effects even if the final ledger write is lost or the process restarts at the wrong moment.

### Replay behavior

| Situation | Result |
|---|---|
| Marker already exists | The replay is skipped as already fulfilled. |
| Activation completed, finalization did not | Replay reaches the fulfillment marker and exits safely. |
| Activation cannot proceed safely | The application is moved to `Payment Review`. |

## Application/rental/car state transitions

### Application states

| State | Meaning in this system |
|---|---|
| `Approved` | Eligible to start payment checkout. |
| `Payment Review` | Stripe confirmed payment, but automatic activation was blocked. |
| `Paid` | Activation succeeded and the rental exists. |

### Rental and car behavior

| State change | Source |
|---|---|
| Application -> `Paid` | `api/paymentActivation.ts` after successful activation writes. |
| Rental -> `Active` | Activation transaction. |
| Car -> `Rented` | Activation transaction. |
| Car -> `Available` | Only after subscription deletion or other release flow proves no live rental remains. |

### Version-gated writes

Version-gated application updates still prevent stale payment links from overwriting newer state. That is unchanged from V2.

## Concurrency controls and advisory locking

| Control | Purpose |
|---|---|
| Advisory lock on application id | Prevents concurrent checkout completion work from stepping on the same application. |
| Version-gated application updates | Prevents stale checkout work from winning after a newer link exists. |
| Database claim on the ledger row | Prevents duplicate webhook deliveries from running the same work twice. |
| Fulfillment marker lookup | Prevents replayed checkout completion from duplicating side effects. |

The current processing model is still single-process inline execution, but the claim/finalize boundary is now worker-safe.

## Failure scenarios and replay behavior

| Scenario | Behavior |
|---|---|
| Duplicate Stripe webhook delivery | The ledger dedupe path skips or reclaims safely. |
| Same event retried after a stale processing claim | The stale claim can be reclaimed after five minutes. |
| Side effect succeeded but ledger finalization failed | The fulfillment marker prevents duplicate activation on replay. |
| Stripe temporarily unavailable | The event is marked retryable and the error is rethrown. |
| Payment confirmed but automatic activation blocked | The application moves to `Payment Review`. |
| Session replay after completion | The replay is skipped as already fulfilled or already processed. |

## Operational notes / troubleshooting

### What to look at first

- `stripe_webhook_events`
- application `status`
- `pending_checkout_session_id`
- rental row for the application
- car status

### Useful signals

V3 writes structured webhook logs that include:

- `eventId`
- `checkoutSessionId`
- `applicationId`
- `carId`
- `processingSource`
- `fulfillmentState`
- retry classification
- whether a replay was skipped

### Common operator reads

| Symptom | Likely meaning |
|---|---|
| Event is `processing` too long | A worker crashed or stalled; the stale claim window may allow reclamation. |
| Application is `Payment Review` | Payment succeeded but activation was blocked by a business rule or schema issue. |
| Event is `processed` with `manual_review` | No retry is expected; human review is needed. |
| Event is `failed` | Retryable failure; inspect `error_message` and infra health. |

## Known limitations

- The system is queue-ready but not queue-backed yet.
- Fulfillment markers still reuse `stripe_webhook_events` instead of a dedicated fulfillment table.
- `api/routes/stripe.ts` is thinner than before, but it is still the HTTP adapter and still owns request validation and Stripe error mapping.
- Legacy webhook ledger compatibility remains in the code path for older data shapes.
- The current processing model still runs inline in the web process; a future worker should reuse `processStripeWebhookWorkItem()`.

## Recommended next steps

1. Add a real worker/queue transport that calls `processStripeWebhookWorkItem()`.
2. Decide whether fulfillment markers should stay in `stripe_webhook_events` or move to a dedicated fulfillment table.
3. Tighten the observability contract around `retry_count` and terminal replay reasons.
4. Consider moving any remaining HTTP-specific Stripe logic out of `api/routes/stripe.ts` once the current boundaries settle.
5. Keep `docs/stripe-system-v2.md` as the historical V2 baseline and use this document as the active operational reference.
