-- Add direct reservation settings to tenants table
-- This allows tenants to reserve a percentage or fixed number of spaces for their direct site
-- Partners (CAVU, Holiday Extras) will only see the leftover capacity

alter table public.tenants
  add column if not exists direct_reserve_mode text not null default 'none', -- 'none' | 'percent' | 'fixed'
  add column if not exists direct_reserve_value integer not null default 0;

-- Add constraint to ensure valid mode values
alter table public.tenants
  add constraint tenants_direct_reserve_mode_chk
  check (direct_reserve_mode in ('none', 'percent', 'fixed'));

-- Add constraint to ensure reserve_value is non-negative
alter table public.tenants
  add constraint tenants_direct_reserve_value_chk
  check (direct_reserve_value >= 0);

-- Add comment explaining the columns
comment on column public.tenants.direct_reserve_mode is 'Reservation mode: none (no reservation), percent (reserve percentage), or fixed (reserve fixed number of spaces)';
comment on column public.tenants.direct_reserve_value is 'Reservation value: if mode is percent, this is the percentage (0-100). If mode is fixed, this is the number of spaces to reserve.';

