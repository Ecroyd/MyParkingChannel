-- 1) Archive table: stores a copy of a booking when it is deleted
create table if not exists public.bookings_archive (
  archive_id uuid primary key default gen_random_uuid(),

  -- original booking identity
  booking_id uuid not null,
  tenant_id uuid not null,

  -- what happened
  deleted_at timestamptz not null default now(),
  deleted_by uuid null,
  delete_source text null, -- e.g. 'app', 'sql', 'rpc', 'unknown'

  -- snapshot of the booking row at delete time
  booking_row jsonb not null
);

create index if not exists bookings_archive_tenant_deleted_at_idx
  on public.bookings_archive (tenant_id, deleted_at desc);

create index if not exists bookings_archive_booking_id_idx
  on public.bookings_archive (booking_id);

-- 2) Function: write deleted row into archive
create or replace function public.archive_booking_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.bookings_archive (
    booking_id,
    tenant_id,
    deleted_at,
    deleted_by,
    delete_source,
    booking_row
  )
  values (
    old.id,
    old.tenant_id,
    now(),
    auth.uid(),
    coalesce(current_setting('app.delete_source', true), 'unknown'),
    to_jsonb(old)
  );

  return old;
end;
$$;

-- 3) Trigger: fire before delete
drop trigger if exists trg_archive_booking_on_delete on public.bookings;

create trigger trg_archive_booking_on_delete
before delete on public.bookings
for each row
execute function public.archive_booking_on_delete();

-- 4) RLS: enabled + tenant-safe reads (optional but recommended)
alter table public.bookings_archive enable row level security;

-- If you already have helper functions for tenant access, replace this with your standard pattern.
-- This version assumes you have a user_tenants table with (user_id, tenant_id).
drop policy if exists "archive_read_own_tenant" on public.bookings_archive;
create policy "archive_read_own_tenant"
on public.bookings_archive
for select
to authenticated
using (
  exists (
    select 1
    from public.user_tenants ut
    where ut.user_id = auth.uid()
      and ut.tenant_id = bookings_archive.tenant_id
  )
);

-- Only allow platform admins to read all (if you have platform_admins)
-- If you don't have platform_admins table, delete this policy block.
drop policy if exists "archive_read_platform_admin" on public.bookings_archive;
create policy "archive_read_platform_admin"
on public.bookings_archive
for select
to authenticated
using (
  exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
  )
);

-- Prevent inserts/updates/deletes by normal users (archive should only be written by trigger)
drop policy if exists "archive_no_write" on public.bookings_archive;
create policy "archive_no_write"
on public.bookings_archive
for all
to authenticated
using (false)
with check (false);
