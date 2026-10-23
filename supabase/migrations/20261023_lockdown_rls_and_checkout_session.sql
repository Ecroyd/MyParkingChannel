-- 1) Close public access to tables that had Row Level Security disabled.
--    With RLS off, the public anon key (shipped to every browser) could SELECT, INSERT,
--    UPDATE and DELETE these tables directly through the Supabase REST API.
--    All application access to them uses the service-role key (checked in code), which
--    bypasses RLS, so enabling RLS with no policies blocks only anon/authenticated clients.
alter table public.anpr_outbox               enable row level security;
alter table public.booking_external_payloads enable row level security;
alter table public.booking_import_stage      enable row level security;
alter table public.ingest_email_parses       enable row level security;
alter table public.opportunity_team_members  enable row level security;
alter table public.product_capacity          enable row level security;
alter table public.product_rate_plans        enable row level security;
alter table public.products                  enable row level security;
alter table public.supplier_sync_alerts      enable row level security;
alter table public.supplier_sync_failures    enable row level security;
alter table public.system_health_config      enable row level security;
alter table public.tenant_alert_routes       enable row level security;
alter table public.tenant_anpr_config        enable row level security;
alter table public.tenant_inbound_inboxes    enable row level security;
alter table public.tenant_invitations        enable row level security;
alter table public.vwb_backfill_staging      enable row level security;

-- 2) The Stripe webhook stores the Checkout Session id on the booking and the /success page
--    looks bookings up by it, but the column never existed, so every website checkout
--    booking insert failed. Additive and nullable: no effect on existing rows.
alter table public.bookings add column if not exists stripe_checkout_session_id text;
create index if not exists bookings_stripe_checkout_session_id_idx
  on public.bookings (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;
