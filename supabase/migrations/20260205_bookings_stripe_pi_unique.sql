-- Add stripe_payment_intent_id to bookings if missing (used for webhook idempotency).
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'stripe_payment_intent_id'
  ) then
    alter table public.bookings add column stripe_payment_intent_id text;
  end if;
end $$;

-- Idempotency for Stripe webhooks: at most one booking per (tenant_id, stripe_payment_intent_id).
-- Prevents duplicate bookings when Stripe retries checkout.session.completed.
create unique index if not exists bookings_pi_unique
on public.bookings (tenant_id, stripe_payment_intent_id)
where stripe_payment_intent_id is not null;
