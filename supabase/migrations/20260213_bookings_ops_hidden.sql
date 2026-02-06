-- Soft-hide for ops: keep bookings in dataset, filter by ops_hidden in UI. "Show hidden" reveals them.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'bookings') then
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'ops_hidden') then
      alter table public.bookings add column ops_hidden boolean not null default false;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'ops_hidden_reason') then
      alter table public.bookings add column ops_hidden_reason text;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'ops_hidden_at') then
      alter table public.bookings add column ops_hidden_at timestamptz;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'ops_hidden_by') then
      alter table public.bookings add column ops_hidden_by uuid;
    end if;
  end if;
end $$;

create index if not exists bookings_ops_hidden_idx
  on public.bookings (tenant_id, ops_hidden, start_at, end_at);
