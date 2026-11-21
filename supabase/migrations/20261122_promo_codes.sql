-- Promo codes (Admin -> Pricing -> Promo Codes): discount codes customers type on the car park's
-- own booking site. A code takes a percentage or a fixed amount off the parking price, can be
-- limited to a date range, a number of uses and a minimum spend, and can be switched off.
--
-- Read and written only by the server (service role) after a session or tenant check, so RLS is
-- on with no policies.

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- Stored upper case with no spaces; customers can type it in any case.
  code text not null check (code ~ '^[A-Z0-9_-]{2,32}$'),
  description text,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  -- Percent: 1-100. Fixed: pounds off.
  discount_value numeric(10, 2) not null check (discount_value > 0),
  -- Dates (UK) on which the code can be used to book; null = no limit that side.
  valid_from date,
  valid_until date,
  -- Total bookings the code can be used for; null = unlimited.
  max_uses integer check (max_uses is null or max_uses > 0),
  -- Smallest parking price (before the discount) the code applies to; null = any.
  min_spend numeric(10, 2) check (min_spend is null or min_spend >= 0),
  times_used integer not null default 0,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promo_codes_percent_range check (discount_type <> 'percent' or discount_value <= 100),
  constraint promo_codes_dates_order check (valid_from is null or valid_until is null or valid_from <= valid_until)
);

create unique index if not exists promo_codes_tenant_code_uniq on public.promo_codes (tenant_id, code);

alter table public.promo_codes enable row level security;

-- Count a use when a paid booking is created (atomic, so two bookings at once both count).
create or replace function public.increment_promo_code_use(p_promo_code_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.promo_codes
  set times_used = times_used + 1, updated_at = now()
  where id = p_promo_code_id;
$$;

revoke all on function public.increment_promo_code_use(uuid) from public, anon, authenticated;
