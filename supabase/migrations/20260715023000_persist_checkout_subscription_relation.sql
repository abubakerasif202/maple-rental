-- Persist the Stripe subscription to Checkout Session relationship so later
-- invoice webhooks do not need to search Stripe heuristically.
-- Rollback: drop the index and column after all dependent code is removed.

BEGIN;

ALTER TABLE public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_subscription_checkout
  ON public.stripe_webhook_events (stripe_subscription_id, received_at DESC)
  WHERE stripe_subscription_id IS NOT NULL
    AND checkout_session_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
