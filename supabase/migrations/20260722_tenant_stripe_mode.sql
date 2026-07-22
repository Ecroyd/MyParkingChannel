-- Persist whether a tenant Connect account was linked in test or live mode
ALTER TABLE public.tenant_stripe
  ADD COLUMN IF NOT EXISTS mode text;

ALTER TABLE public.tenant_stripe
  DROP CONSTRAINT IF EXISTS tenant_stripe_mode_check;

ALTER TABLE public.tenant_stripe
  ADD CONSTRAINT tenant_stripe_mode_check
  CHECK (mode IS NULL OR mode IN ('test', 'live'));

COMMENT ON COLUMN public.tenant_stripe.mode IS 'Stripe Connect mode used when the account was linked: test or live';
