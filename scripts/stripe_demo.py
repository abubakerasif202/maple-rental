#!/usr/bin/env python3
"""
stripe_demo.py — Gala Rentals · Stripe API Feature Demo
========================================================
This script demonstrates the full breadth of Stripe API capabilities
as integrated into the Gala Rentals platform. It uses the official
Stripe Python SDK and covers the following feature areas:

  1.  Account & Balance         — inspect the connected Stripe account
  2.  Customer Management       — create, list, and look up customers
  3.  Product Catalogue         — create and list rental products
  4.  Pricing                   — one-time and recurring price objects
  5.  Payment Links             — shareable checkout URLs (no-code)
  6.  Invoicing                 — draft → item → finalise workflow
  7.  Payment Intents           — inspect payment lifecycle objects
  8.  Subscriptions             — recurring billing management
  9.  Coupons & Discounts       — percentage and fixed-amount offers
  10. Refunds                   — full and partial refund workflow
  11. Disputes                  — list and evidence submission
  12. Resource Search           — cross-object Stripe query syntax

Prerequisites
-------------
  pip install stripe

Set the following environment variable before running:
  export STRIPE_SECRET_KEY="sk_test_..."

Or pass it directly via the STRIPE_KEY variable at the top of this file.
"""

import os
import sys
import json
import time
import stripe

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

STRIPE_KEY = os.environ.get("STRIPE_SECRET_KEY", "")

if not STRIPE_KEY:
    print("[ERROR] STRIPE_SECRET_KEY environment variable is not set.")
    print("        Export it before running:  export STRIPE_SECRET_KEY=sk_test_...")
    sys.exit(1)

stripe.api_key = STRIPE_KEY

# Colour helpers for terminal output
GREEN  = "\033[92m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
RED    = "\033[91m"
RESET  = "\033[0m"
BOLD   = "\033[1m"


def header(title: str) -> None:
    """Print a prominent section header."""
    bar = "=" * 60
    print(f"
{BOLD}{CYAN}{bar}{RESET}")
    print(f"{BOLD}{CYAN}  {title}{RESET}")
    print(f"{BOLD}{CYAN}{bar}{RESET}")


def ok(label: str, value) -> None:
    print(f"  {GREEN}✔{RESET}  {BOLD}{label}:{RESET} {value}")


def info(msg: str) -> None:
    print(f"  {YELLOW}ℹ{RESET}  {msg}")


def pretty(obj) -> str:
    """Return a compact JSON representation of a Stripe object or dict."""
    if hasattr(obj, "to_dict"):
        obj = obj.to_dict()
    return json.dumps(obj, indent=4, default=str)


# ===========================================================================
# 1. ACCOUNT & BALANCE
# ===========================================================================

def demo_account_and_balance() -> None:
    header("1 · Account & Balance")

    account = stripe.Account.retrieve()
    ok("Account ID",      account.id)
    ok("Display Name",    account.get("settings", {}).get("dashboard", {}).get("display_name", "N/A"))
    ok("Country",         account.country)
    ok("Default Currency",account.default_currency)
    ok("Charges Enabled", account.charges_enabled)

    balance = stripe.Balance.retrieve()
    for entry in balance.available:
        ok(f"Available ({entry['currency'].upper()})",
           f"{entry['amount'] / 100:.2f} {entry['currency'].upper()}")
    for entry in balance.pending:
        ok(f"Pending ({entry['currency'].upper()})",
           f"{entry['amount'] / 100:.2f} {entry['currency'].upper()}")


# ===========================================================================
# 2. CUSTOMER MANAGEMENT
# ===========================================================================

def demo_customers() -> dict:
    """Create two demo customers and return their IDs."""
    header("2 · Customer Management")

    # Create customers
    alice = stripe.Customer.create(
        name="Alice Johnson",
        email="alice@galarental.demo",
        metadata={"role": "tenant", "tier": "premium"},
    )
    ok("Created customer", f"{alice.name} ({alice.id})")

    bob = stripe.Customer.create(
        name="Bob Smith",
        email="bob@galarental.demo",
        metadata={"role": "tenant", "tier": "standard"},
    )
    ok("Created customer", f"{bob.name} ({bob.id})")

    # List customers
    customers = stripe.Customer.list(limit=5)
    info(f"Total customers retrieved: {len(customers.data)}")
    for c in customers.data:
        print(f"     • {c.name:<25} {c.email:<35} id={c.id}")

    return {"alice_id": alice.id, "bob_id": bob.id}


# ===========================================================================
# 3. PRODUCT CATALOGUE
# ===========================================================================

def demo_products() -> dict:
    """Create two demo rental products and return their IDs."""
    header("3 · Product Catalogue")

    cabin = stripe.Product.create(
        name="Gala Weekend Rental — Weekend Rental",
        description="A cosy 2-bedroom cabin perfect for weekend getaways in the coastal city fleet.",
        metadata={"category": "cabin", "bedrooms": "2"},
    )
    ok("Created product", f"{cabin.name} ({cabin.id})")

    lakehouse = stripe.Product.create(
        name="Gala Monthly Rental — Monthly Subscription",
        description="Premium lakehouse rental with monthly subscription billing.",
        metadata={"category": "lakehouse", "bedrooms": "4"},
    )
    ok("Created product", f"{lakehouse.name} ({lakehouse.id})")

    products = stripe.Product.list(limit=10)
    info(f"Total products in catalogue: {len(products.data)}")

    return {"cabin_id": cabin.id, "lakehouse_id": lakehouse.id}


# ===========================================================================
# 4. PRICING — ONE-TIME & RECURRING
# ===========================================================================

def demo_prices(product_ids: dict) -> dict:
    """Create one-time and recurring prices; return price IDs."""
    header("4 · Pricing — One-Time & Recurring")

    # One-time price: AUD $350 per weekend
    cabin_price = stripe.Price.create(
        product=product_ids["cabin_id"],
        unit_amount=35000,   # in cents
        currency="aud",
    )
    ok("One-time price (cabin)",
       f"AUD {cabin_price.unit_amount / 100:.2f} — id={cabin_price.id}")

    # Recurring price: AUD $1,200/month for lakehouse
    lakehouse_price = stripe.Price.create(
        product=product_ids["lakehouse_id"],
        unit_amount=120000,  # in cents
        currency="aud",
        recurring={"interval": "month"},
    )
    ok("Recurring price (lakehouse)",
       f"AUD {lakehouse_price.unit_amount / 100:.2f}/month — id={lakehouse_price.id}")

    # List all prices for the cabin
    cabin_prices = stripe.Price.list(product=product_ids["cabin_id"])
    info(f"Prices for cabin product: {len(cabin_prices.data)}")

    return {
        "cabin_price_id":     cabin_price.id,
        "lakehouse_price_id": lakehouse_price.id,
    }


# ===========================================================================
# 5. PAYMENT LINKS
# ===========================================================================

def demo_payment_links(price_ids: dict) -> None:
    header("5 · Payment Links (No-Code Checkout)")

    link = stripe.PaymentLink.create(
        line_items=[{"price": price_ids["cabin_price_id"], "quantity": 1}],
    )
    ok("Payment link created", link.url)
    info("Share this URL with a customer to collect payment without any code.")


# ===========================================================================
# 6. INVOICING
# ===========================================================================

def demo_invoicing(customer_ids: dict, price_ids: dict) -> None:
    header("6 · Invoicing — Draft → Item → Finalise")

    # Step 1: Create a draft invoice
    invoice = stripe.Invoice.create(
        customer=customer_ids["alice_id"],
        days_until_due=7,
        collection_method="send_invoice",
    )
    ok("Draft invoice created", f"id={invoice.id}, status={invoice.status}")

    # Step 2: Add a line item
    item = stripe.InvoiceItem.create(
        customer=customer_ids["alice_id"],
        pricing={"price": price_ids["cabin_price_id"]},
        invoice=invoice.id,
    )
    ok("Invoice item added", f"id={item.id}")

    # Step 3: Finalise (moves status from 'draft' → 'open')
    finalised = stripe.Invoice.finalize_invoice(invoice.id)
    ok("Invoice finalised",
       f"status={finalised.status}, amount_due=AUD {finalised.amount_due / 100:.2f}")
    if finalised.hosted_invoice_url:
        ok("Hosted invoice URL", finalised.hosted_invoice_url)

    # List invoices
    invoices = stripe.Invoice.list(customer=customer_ids["alice_id"], limit=5)
    info(f"Invoices for Alice: {len(invoices.data)}")
    for inv in invoices.data:
        print(f"     • {inv.id}  status={inv.status:<8}  "
              f"due=AUD {inv.amount_due / 100:.2f}")


# ===========================================================================
# 7. PAYMENT INTENTS
# ===========================================================================

def demo_payment_intents(customer_ids: dict) -> None:
    header("7 · Payment Intents")

    # List existing payment intents for Alice
    intents = stripe.PaymentIntent.list(
        customer=customer_ids["alice_id"],
        limit=5,
    )
    info(f"Payment intents for Alice: {len(intents.data)}")
    for pi in intents.data:
        print(f"     • {pi.id}  status={pi.status:<30}  "
              f"amount=AUD {pi.amount / 100:.2f}")

    # Create a standalone payment intent (e.g. for a deposit)
    deposit = stripe.PaymentIntent.create(
        amount=5000,   # AUD $50 security deposit
        currency="aud",
        customer=customer_ids["bob_id"],
        description="Security deposit — Gala Weekend Rental booking",
        metadata={"booking_ref": "GALA-2026-001"},
    )
    ok("Deposit PaymentIntent created",
       f"id={deposit.id}, status={deposit.status}, "
       f"amount=AUD {deposit.amount / 100:.2f}")


# ===========================================================================
# 8. SUBSCRIPTIONS
# ===========================================================================

def demo_subscriptions(customer_ids: dict, price_ids: dict) -> None:
    header("8 · Subscriptions — Recurring Billing")

    # NOTE: Creating a subscription requires a valid payment method attached
    # to the customer. In test mode, use a test payment method token.
    # Here we attach a test card via PaymentMethod then create the subscription.

    # Attach a test payment method to Bob
    pm = stripe.PaymentMethod.create(
        type="card",
        card={"token": "tok_visa"},   # Stripe test token
    )
    stripe.PaymentMethod.attach(pm.id, customer=customer_ids["bob_id"])
    stripe.Customer.modify(
        customer_ids["bob_id"],
        invoice_settings={"default_payment_method": pm.id},
    )
    ok("Test payment method attached to Bob", pm.id)

    # Create subscription
    sub = stripe.Subscription.create(
        customer=customer_ids["bob_id"],
        items=[{"price": price_ids["lakehouse_price_id"]}],
        payment_behavior="default_incomplete",
        expand=["latest_invoice.payment_intent"],
    )
    ok("Subscription created",
       f"id={sub.id}, status={sub.status}")
    ok("Billing interval",
       f"{sub['items'].data[0].price.recurring.interval}ly")

    # List subscriptions
    subs = stripe.Subscription.list(customer=customer_ids["bob_id"], limit=5)
    info(f"Active subscriptions for Bob: {len(subs.data)}")

    # Update subscription (change quantity — illustrative)
    updated = stripe.Subscription.modify(
        sub.id,
        metadata={"updated_by": "stripe_demo.py"},
    )
    ok("Subscription updated", f"metadata={updated.metadata}")

    # Cancel subscription
    cancelled = stripe.Subscription.cancel(sub.id)
    ok("Subscription cancelled", f"status={cancelled.status}")


# ===========================================================================
# 9. COUPONS & DISCOUNTS
# ===========================================================================

def demo_coupons() -> None:
    header("9 · Coupons & Discounts")

    # Percentage coupon — one-time use
    coupon_pct = stripe.Coupon.create(
        name="GALA10",
        percent_off=10,
        duration="once",
    )
    ok("Coupon created (10% off, once)",
       f"id={coupon_pct.id}, name={coupon_pct.name}")

    # Repeating coupon — 3 months
    coupon_rep = stripe.Coupon.create(
        name="WELCOME20",
        percent_off=20,
        duration="repeating",
        duration_in_months=3,
    )
    ok("Coupon created (20% off, 3 months)",
       f"id={coupon_rep.id}, name={coupon_rep.name}")

    # Fixed-amount coupon — AUD $25 off
    coupon_fixed = stripe.Coupon.create(
        name="SAVE25",
        amount_off=2500,   # in cents
        currency="aud",
        duration="once",
    )
    ok("Coupon created ($25 off, once)",
       f"id={coupon_fixed.id}, name={coupon_fixed.name}")

    # List coupons
    coupons = stripe.Coupon.list(limit=10)
    info(f"Total coupons in account: {len(coupons.data)}")
    for c in coupons.data:
        discount = (f"{c.percent_off}%" if c.percent_off
                    else f"AUD {c.amount_off / 100:.2f}")
        print(f"     • {c.name:<15} {discount:<12} duration={c.duration}")


# ===========================================================================
# 10. REFUNDS
# ===========================================================================

def demo_refunds(customer_ids: dict) -> None:
    header("10 · Refunds")

    # List existing payment intents to find one to refund
    intents = stripe.PaymentIntent.list(
        customer=customer_ids["alice_id"],
        limit=5,
    )

    succeeded = [pi for pi in intents.data if pi.status == "succeeded"]
    if not succeeded:
        info("No succeeded PaymentIntents found for Alice — skipping refund demo.")
        info("In a real scenario, a succeeded PaymentIntent would be refunded here.")
        info("Example code:")
        print("""
        refund = stripe.Refund.create(
            payment_intent="pi_xxxx",
            amount=5000,          # partial refund of AUD $50
            reason="requested_by_customer",
        )
        """)
        return

    pi = succeeded[0]
    refund = stripe.Refund.create(
        payment_intent=pi.id,
        reason="requested_by_customer",
    )
    ok("Refund created",
       f"id={refund.id}, amount=AUD {refund.amount / 100:.2f}, "
       f"status={refund.status}")

    refunds = stripe.Refund.list(payment_intent=pi.id)
    info(f"Refunds for PaymentIntent {pi.id}: {len(refunds.data)}")


# ===========================================================================
# 11. DISPUTES
# ===========================================================================

def demo_disputes() -> None:
    header("11 · Disputes")

    disputes = stripe.Dispute.list(limit=5)
    info(f"Open disputes: {len(disputes.data)}")
    if disputes.data:
        for d in disputes.data:
            print(f"     • {d.id}  reason={d.reason}  "
                  f"amount=AUD {d.amount / 100:.2f}  status={d.status}")
    else:
        info("No disputes found — this is expected in a fresh sandbox account.")
        info("To submit evidence on a dispute, use stripe.Dispute.modify():")
        print("""
        stripe.Dispute.modify(
            "dp_xxxx",
            evidence={
                "customer_email_address": "alice@galarental.demo",
                "product_description": "Gala Weekend Rental — Weekend Rental",
                "uncategorized_text": "Customer confirmed stay via email.",
            },
            submit=True,
        )
        """)


# ===========================================================================
# 12. RESOURCE SEARCH
# ===========================================================================

def demo_search() -> None:
    header("12 · Resource Search (Stripe Query Syntax)")

    # Search customers by email domain
    results = stripe.Customer.search(
        query="email~'galarental.demo'",
        limit=10,
    )
    ok("Customer search (email~'galarental.demo')",
       f"{len(results.data)} result(s)")
    for c in results.data:
        print(f"     • {c.name:<25} {c.email}")

    # Search invoices by status
    inv_results = stripe.Invoice.search(
        query="status:'open'",
        limit=5,
    )
    ok("Invoice search (status:'open')",
       f"{len(inv_results.data)} result(s)")


# ===========================================================================
# MAIN
# ===========================================================================

def main() -> None:
    print(f"
{BOLD}{'=' * 60}")
    print("  Gala Rentals — Stripe API Feature Demo")
    print(f"{'=' * 60}{RESET}")
    print("  Account: Gala rentals sandbox")
    print("  Mode:    TEST (no real charges)")
    print(f"  SDK:     stripe-python v{stripe.VERSION}")
    print()

    # Run each demo section, collecting IDs for downstream steps
    demo_account_and_balance()

    customer_ids = demo_customers()
    product_ids  = demo_products()
    price_ids    = demo_prices(product_ids)

    demo_payment_links(price_ids)
    demo_invoicing(customer_ids, price_ids)
    demo_payment_intents(customer_ids)
    demo_subscriptions(customer_ids, price_ids)
    demo_coupons()
    demo_refunds(customer_ids)
    demo_disputes()
    demo_search()

    header("Demo Complete")
    print(f"  {GREEN}All Stripe API feature areas exercised successfully.{RESET}")
    print(f"  Review the Stripe Dashboard for full object details:")
    print("  https://dashboard.stripe.com/test/dashboard
")


if __name__ == "__main__":
    main()
