-- Let the LOS price grid hold prices for any channel set up in Admin > Channels.
--
-- pricing_rules_channel_check (created outside these migrations) only allowed a fixed list of
-- channel codes and rejected 'direct', the channel the tenant booking site quotes and charges
-- with (/api/pricing/public-quote, /api/payments/public-checkout). Saving Direct prices in
-- Admin > Pricing failed with "violates check constraint pricing_rules_channel_check".
--
-- Channel codes come from the channels table, so the check now only enforces the code format.
-- NOT VALID: existing rows are left as they are and only new or changed rows are checked.

alter table public.pricing_rules drop constraint if exists pricing_rules_channel_check;

alter table public.pricing_rules
  add constraint pricing_rules_channel_check
  check (channel is null or channel ~ '^[a-z0-9_-]{1,64}$') not valid;
