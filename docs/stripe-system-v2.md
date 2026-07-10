# Stripe System V2 (Archived)

This document is retained only as a historical marker. The V2 checkout-to-rental
activation model is retired and must not be restored.

The authoritative production behavior is documented in:

- `docs/stripe-system-v3.md`
- `docs/STRIPE_SETUP.md`
- `docs/STRIPE_HANDOFF_CHECKLIST.md`

Current hard rules:

- Checkout tokens use `carId: null`.
- Stripe Checkout charges the approved weekly rental only.
- Bonds and setup fees are collected outside Stripe Checkout.
- Verified Checkout completion marks the application `Paid` only.
- Checkout completion never creates or repairs rentals and never changes car status.
- Historical Stripe metadata containing `car_id` is ignored for fulfillment writes.
