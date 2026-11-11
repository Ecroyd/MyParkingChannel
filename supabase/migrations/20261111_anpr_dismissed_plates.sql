-- "Cars without a booking" dashboard card: plates staff have dismissed (wrong car park, a
-- delivery, a one-off visitor). Reads of the plate up to dismissed_at are hidden from the card; if
-- the car comes back later it shows again. One row per plate per tenant; dismissing again moves
-- dismissed_at forward. Written and read only by the server (service role), so RLS is on with no
-- policies. The card works without this table; dismissing just fails until it exists.

create table if not exists public.anpr_dismissed_plates (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plate_norm text not null,
  dismissed_at timestamptz not null default now(),
  dismissed_by uuid,
  primary key (tenant_id, plate_norm)
);

alter table public.anpr_dismissed_plates enable row level security;
