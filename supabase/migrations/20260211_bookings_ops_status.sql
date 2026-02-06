-- Add ops_status to bookings if missing (used by arrivals/departures UI and ANPR).
-- Allowed values: arrived, no_show, take_key, arrived_key_taken, departed.
-- No-op if public.bookings does not exist yet.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'bookings'
  )
  and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'ops_status'
  ) then
    alter table public.bookings add column ops_status text;
    comment on column public.bookings.ops_status is 'Ops workflow: arrived, no_show, take_key, arrived_key_taken, departed';
  end if;
end $$;
