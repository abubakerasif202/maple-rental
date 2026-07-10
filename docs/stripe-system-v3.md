# Stripe System V3

Stripe System V3 is Maple Rental's payment-only subscription workflow.

## Contract

1. Admin approves the application, weekly amount, start date, vehicle label, and manual bond state.
2. The server issues a signed Checkout token with `carId: null`.
3. The server creates a hosted Stripe Checkout Session in `subscription` mode.
4. Checkout contains one recurring weekly rental line item. Bond and setup fees are never included.
5. Future start dates use Stripe subscription scheduling. Customer communications must disclose that Checkout charges `$0.00` today and the first weekly payment occurs on the selected start date.
6. Stripe sends signed events to `POST /api/stripe/webhook`.
7. The webhook route verifies the raw request body and signature before processing.
8. The webhook ledger claims each Stripe event idempotently and supports safe stale-claim recovery.
9. A paid Checkout marks the application `Paid`, clears `pending_checkout_session_id`, and records a fulfillment marker.
10. Checkout fulfillment does not create or update rental rows and does not change car status.

## Ownership

| Responsibility | Source |
| --- | --- |
| Stripe client and API version | `api/stripeClient.ts`, `api/constants.ts` |
| Signed payment links | `api/checkoutTokens.ts`, `api/paymentLinks.ts` |
| Checkout construction | `api/services/stripeCheckoutService.ts` |
| Webhook signature route | `api/routes/webhooks.ts` |
| Event claim and dispatch | `api/services/stripeWebhookService.ts` |
| Payment-only application write | `api/paymentActivation.ts` |
| Catalog definition | `shared/stripeCatalog.ts`, `api/stripeCatalog.ts` |
| Production readiness check | `scripts/stripe-setup.ts` |

## Webhook event contract

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

Checkout completion events own application payment state. Subscription and invoice
events may reconcile a manually linked existing rental only when a strict
`stripe_subscription_id` match exists. Metadata-only fallback updates are refused.

## Replay safety

- Stripe event ids are unique in `stripe_webhook_events`.
- `processing`, `processed`, and `failed` states control retries.
- Stale processing claims use `updated_at`, preserving `received_at` as audit history.
- A separate `fulfill:vehicle-checkout:<session-id>` marker prevents duplicate application payment writes if ledger finalization previously failed.
- Legacy `car_id` metadata is retained only for safe logging/correlation and cannot trigger rental or car writes.

## Application states

| State | Meaning |
| --- | --- |
| `Approved` | Quote is approved and Checkout may be completed. |
| `Payment Review` | Stripe confirmed payment but the application write needs admin review or retry. |
| `Paid` | Verified Checkout completion was recorded. Operational rental activation remains manual. |
| `Cancelled` | Application is closed; replayed Checkout events cannot reactivate it. |

## Handoff gates

Run:

```powershell
npm run validate
npm run verify:schema-contract
npm run build
npm run stripe:handoff
git diff --check
```

`stripe:handoff` is read-only. It verifies live key mode, account readiness,
the weekly catalog product, webhook URL/events/API version, support profile,
database mode, and schema compatibility. Any overlapping secondary webhook
endpoint must be reviewed and confirmed side-effect safe before production handoff.
