-- Drop tables that have no references in the application code.
-- Run only after confirming you don't need these (e.g. billing_plans for future billing).
-- Comment out any table you want to keep.

-- One-off / staging (safest to drop)
DROP TABLE IF EXISTS public.vwb_backfill_staging;
DROP TABLE IF EXISTS public.booking_import_stage;

-- Unused config / legacy
-- DROP TABLE IF EXISTS public.system_health_config;

-- Legacy backup (only if you've confirmed you don't need it)
-- DROP TABLE IF EXISTS public.bookings_backup;

-- Unused capacity table (app uses tenant_capacity and product_capacity)
-- DROP TABLE IF EXISTS public.inventory;

-- Unused channel alias table (channels still used via channel_accounts)
-- DROP TABLE IF EXISTS public.channel_aliases;

-- Billing / plans (only drop if you're sure you won't use them; order matters for FKs)
-- DROP TABLE IF EXISTS public.tenant_billing;
-- DROP TABLE IF EXISTS public.plan_subscriptions;
-- DROP TABLE IF EXISTS public.billing_plans;

-- Feature flags (only drop if you're sure you won't use them)
-- DROP TABLE IF EXISTS public.tenant_features;
