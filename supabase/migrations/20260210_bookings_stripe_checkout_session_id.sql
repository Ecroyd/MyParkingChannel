-- Store Stripe Checkout Session ID on bookings so the success page can look up by session_id
-- instead of relying on tenant/reference in the URL.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'stripe_checkout_session_id'
  ) then
    alter table public.bookings add column stripe_checkout_session_id text;
  end if;
end $$;
