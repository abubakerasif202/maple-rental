# Stripe API — Capability Brief

> Deprecated operationally. This file is a historical sandbox snapshot and is not the source of truth for client handoff, live account identity, webhook configuration, or production readiness.
>
> Use [docs/STRIPE_HANDOFF_CHECKLIST.md](./STRIPE_HANDOFF_CHECKLIST.md), [docs/STRIPE_SETUP.md](./STRIPE_SETUP.md), and `npm run stripe:handoff` instead.

**Project:** Gala Rentals
**Account:** Gala rentals sandbox (`acct_1T8kakDaPc7L3S6e`)
**Mode:** Test (sandbox — no real charges)
**Author:** Manus AI
**Date:** March 2026

---

## Overview

Stripe is a developer-first payments platform that provides a unified API surface for the full lifecycle of online commerce — from collecting a one-time payment to managing complex recurring billing, issuing invoices, handling disputes, and analysing financial data. This brief documents every major capability area available through the Stripe API, with live-tested results from the Gala Rentals sandbox account.

---

## 1. Account & Balance

The Stripe account object is the root of all activity. It exposes the business identity, enabled capabilities, supported currencies, and payout configuration. The balance object provides a real-time view of funds split across **available** (ready to pay out) and **pending** (awaiting settlement) pools, broken down by currency.

| Field | Live Value |
|---|---|
| Account ID | `acct_1T8kakDaPc7L3S6e` |
| Display Name | Gala rentals sandbox |
| Default Currency | AUD |
| Charges Enabled | `true` |
| Available Balance | AUD 0.00 (sandbox) |
| Pending Balance | AUD 0.00 (sandbox) |

---

## 2. Customer Management

Customers are persistent objects that store contact information, payment methods, and billing history. Attaching a customer to every transaction enables detailed reporting, saved cards, and subscription billing.

**Key operations:**

- `stripe.Customer.create()` — register a new customer with name, email, phone, address, and arbitrary metadata.
- `stripe.Customer.modify()` — update any field, including the default payment method for invoices.
- `stripe.Customer.list()` — paginate through all customers with optional email filter.
- `stripe.Customer.search()` — full-text search using Stripe Query Language (e.g., `email~'galarental.demo'`).

**Live test results:**

| Customer | Email | ID |
|---|---|---|
| Alice Johnson | alice@galarental.demo | `cus_U708RUJyMvPqGC` |
| Bob Smith | bob@galarental.demo | `cus_U7085OZVHNCqWk` |

---

## 3. Product Catalogue

Products represent what is being sold — in Gala Rentals's case, individual rental properties or packages. Products are decoupled from pricing, allowing multiple price points (currencies, billing intervals) to be attached to a single product.

**Key operations:**

- `stripe.Product.create()` — define a product with name, description, images, and metadata.
- `stripe.Product.modify()` — update product details or deactivate a listing.
- `stripe.Product.list()` — retrieve the full catalogue.

**Live test results:**

| Product | Type | ID |
|---|---|---|
| Gala Weekend Rental — Weekend Rental | service | `prod_U709mb1avE9jCh` |
| Gala Monthly Rental — Monthly Subscription | service | `prod_U7098NCEpO8K6t` |

---

## 4. Pricing — One-Time & Recurring

Price objects define the monetary value attached to a product. Stripe supports **one-time** prices for single transactions and **recurring** prices for subscription billing, with flexible interval configuration (daily, weekly, monthly, yearly).

**Key operations:**

- `stripe.Price.create()` — create a price with `unit_amount` (in minor currency units), `currency`, and optional `recurring` interval.
- `stripe.Price.list()` — list all prices, optionally filtered by product.

**Live test results:**

| Price | Amount | Type | Interval | ID |
|---|---|---|---|---|
| Cabin weekend rate | AUD 350.00 | One-time | — | `price_1T8mBMDaPc7L3S6eF1hXwLtQ` |
| Lakehouse monthly rate | AUD 1,200.00 | Recurring | Monthly | `price_1T8mBSDaPc7L3S6eY1behoYL` |

---

## 5. Payment Links

Payment Links generate a hosted checkout URL that can be shared via email, SMS, or social media — no frontend code required. The customer is directed to a Stripe-hosted page to complete payment.

**Key operations:**

- `stripe.PaymentLink.create()` — supply a price and quantity to generate a shareable URL instantly.

**Live test result:**

> **Cabin Rental Payment Link:**
> `https://buy.stripe.com/test_dRm7sLbJb9Tf0XRaRCdZ600`

Payment Links are ideal for ad-hoc bookings, quote follow-ups, and situations where embedding a full checkout flow is not practical.

---

## 6. Invoicing

Stripe's invoicing system supports a structured **draft → open → paid** lifecycle. Invoices can be created manually (for one-off billing) or generated automatically by the subscription engine.

**Workflow:**

1. **Create** a draft invoice attached to a customer (`stripe.Invoice.create()`).
2. **Add line items** via `stripe.InvoiceItem.create()`, referencing a price object.
3. **Finalise** the invoice (`stripe.Invoice.finalize_invoice()`), which transitions status from `draft` to `open` and generates a hosted URL.
4. **Send** the hosted URL to the customer for self-service payment.

**Live test result:**

| Field | Value |
|---|---|
| Invoice ID | `in_1T8mDXDaPc7L3S6ep1tMdZNv` |
| Customer | Alice Johnson |
| Amount Due | AUD 350.00 |
| Status | `open` |
| Days Until Due | 7 |
| Hosted URL | [View Invoice](https://invoice.stripe.com/i/acct_1T8kakDaPc7L3S6e/test_YWNjdF8xVDhrYWtEYVBjN0wzUzZlLF9VNzBEOXNTdUoxQ2NUYW05MGM2UHhWMkR3QjQ4OEwyLDE2MzUzNTkxNw02001zTDwYFs?s=ap) |

---

## 7. Payment Intents

A `PaymentIntent` is the canonical object representing a single payment attempt. It tracks the full state machine from `requires_payment_method` through `processing` to `succeeded` or `canceled`. Every invoice, subscription cycle, and direct charge creates a PaymentIntent under the hood.

**Key operations:**

- `stripe.PaymentIntent.create()` — initiate a payment with amount, currency, customer, and metadata.
- `stripe.PaymentIntent.list()` — retrieve all intents, optionally filtered by customer.
- `stripe.PaymentIntent.confirm()` — confirm with a payment method to trigger processing.
- `stripe.PaymentIntent.cancel()` — abort before capture.

**Live test result:**

| PaymentIntent | Amount | Status | Customer |
|---|---|---|---|
| `pi_3T8mDoDaPc7L3S6e2JCS11FI` | AUD 350.00 | `requires_payment_method` | Alice Johnson |

---

## 8. Subscriptions

Subscriptions automate recurring billing by attaching a customer to a recurring price. Stripe handles proration, trial periods, dunning (failed payment retries), and lifecycle webhooks automatically.

**Key operations:**

- `stripe.Subscription.create()` — start a subscription with one or more price items.
- `stripe.Subscription.modify()` — update items, quantities, proration behaviour, or metadata.
- `stripe.Subscription.cancel()` — cancel immediately or at period end.
- `stripe.Subscription.list()` — filter by customer, price, or status.

**Subscription lifecycle states:**

| Status | Meaning |
|---|---|
| `incomplete` | Awaiting initial payment confirmation |
| `active` | Billing normally |
| `past_due` | Payment failed; retrying |
| `canceled` | Terminated |
| `unpaid` | All retries exhausted |

---

## 9. Coupons & Discounts

Coupons apply percentage or fixed-amount discounts to invoices and subscriptions. They support one-time, repeating (N months), or forever durations.

**Key operations:**

- `stripe.Coupon.create()` — define a coupon with `percent_off` or `amount_off`, duration, and optional redemption limits.
- `stripe.Coupon.list()` — retrieve all active coupons.

**Live test results:**

| Coupon Name | Discount | Duration | ID |
|---|---|---|---|
| GALA10 | 10% off | Once | `reIC7uhx` |
| WELCOME20 | 20% off | 3 months (repeating) | `8erFAGGd` |
| SAVE25 | AUD 25.00 off | Once | (created in demo script) |

---

## 10. Refunds

Refunds reverse a charge, either fully or partially. They are attached to a `PaymentIntent` or `Charge` and support a structured reason code for reporting.

**Key operations:**

- `stripe.Refund.create()` — issue a full or partial refund with an optional reason (`duplicate`, `fraudulent`, `requested_by_customer`).
- `stripe.Refund.list()` — retrieve refund history for a given charge or payment intent.

**Reason codes:**

| Code | Use Case |
|---|---|
| `requested_by_customer` | Guest-initiated cancellation |
| `duplicate` | Accidental double charge |
| `fraudulent` | Unauthorised transaction |

---

## 11. Disputes

When a cardholder disputes a charge with their bank, Stripe creates a `Dispute` object. Businesses can submit evidence directly via the API to contest the chargeback.

**Key operations:**

- `stripe.Dispute.list()` — retrieve open and closed disputes.
- `stripe.Dispute.modify()` — attach evidence fields (customer email, product description, shipping info, etc.) and set `submit=True` to send to the card network.

**Evidence fields supported:** customer email, billing address, product description, receipt, refund policy, service date, shipping documentation, and free-form text.

---

## 12. Resource Search

Stripe's Search API provides a powerful query language (`Stripe Query Language`) for cross-object lookups across customers, invoices, payment intents, subscriptions, and charges.

**Example queries:**

```
email~'galarental.demo'          # customers with email containing domain
status:'open'                     # open invoices
amount>10000 AND currency:'aud'   # large AUD payment intents
metadata['tier']:'premium'        # customers tagged as premium
```

**Supported resources:** `Customer`, `Invoice`, `PaymentIntent`, `Subscription`, `Charge`.

---

## 13. Additional Capabilities (Available via SDK)

Beyond the features demonstrated above, the Stripe API also provides:

| Capability | Description |
|---|---|
| **Webhooks** | Real-time event delivery to your server for every state change |
| **Connect** | Multi-party marketplace payments with platform fees and payouts |
| **Radar** | Machine-learning fraud detection with customisable rules |
| **Terminal** | In-person card reader integration |
| **Issuing** | Create and manage virtual and physical payment cards |
| **Treasury** | Embedded financial accounts and fund flows |
| **Tax** | Automatic sales tax and VAT calculation |
| **Sigma** | SQL-based financial reporting on your Stripe data |
| **Identity** | Document and identity verification |
| **Climate** | Carbon removal contributions embedded in checkout |

---

## Running the Demo Script

```bash
# 1. Install the Stripe Python SDK
pip install stripe

# 2. Export your test secret key
export STRIPE_SECRET_KEY="sk_test_..."

# 3. Run the demo
python3 scripts/stripe_demo.py
```

The script will execute all 12 feature sections sequentially, printing live results to the terminal and creating real objects in your Stripe test account. All objects created are in **test mode** and will never result in real charges.

---

## References

- [Stripe API Reference](https://docs.stripe.com/api)
- [Stripe Python SDK](https://github.com/stripe/stripe-python)
- [Stripe Query Language](https://docs.stripe.com/search#query-fields)
- [Stripe Testing Guide](https://docs.stripe.com/testing)
- [Stripe Dashboard (Test Mode)](https://dashboard.stripe.com/test/dashboard)
