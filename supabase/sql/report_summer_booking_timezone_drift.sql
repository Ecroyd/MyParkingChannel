-- Report bookings likely affected by supplier-local times stored as UTC (BST +1h drift).
-- Review this output before any bulk UPDATE. Do not blindly subtract one hour from all rows.
--
-- Heuristic: during BST (last Sunday in March → last Sunday in October), if
-- start_at/end_at display in Europe/London is exactly 1 hour ahead of raw supplier
-- time preserved in staging/raw_json, flag for correction.

with bst_window as (
  select
    b.id,
    b.reference,
    b.source,
    b.start_at,
    b.end_at,
    b.start_at at time zone 'Europe/London' as start_london,
    b.end_at at time zone 'Europe/London' as end_london,
    s.start_at as staging_start_raw,
    s.end_at as staging_end_raw,
    s.raw_json,
    (b.start_at at time zone 'Europe/London')::date as london_start_date
  from public.bookings b
  left join lateral (
    select st.start_at, st.end_at, st.raw_json
    from public.booking_import_staging st
    where st.tenant_id = b.tenant_id
      and upper(coalesce(st.reference, st.external_reference, '')) = upper(b.reference)
    order by st.updated_at desc nulls last, st.created_at desc nulls last
    limit 1
  ) s on true
  where b.start_at is not null
    and b.end_at is not null
),
flagged as (
  select
    *,
    -- BST: Mar last Sun – Oct last Sun (approx via month for report; refine in app layer if needed)
    case
      when extract(month from london_start_date) between 4 and 9 then true
      when extract(month from london_start_date) = 3
        and extract(day from london_start_date) >= 25 then true
      when extract(month from london_start_date) = 10
        and extract(day from london_start_date) <= 31 then true
      else false
    end as likely_bst_period,
    staging_start_raw as raw_intended_arrival,
    staging_end_raw as raw_intended_return,
    case
      when staging_start_raw ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
        then (staging_start_raw::timestamp at time zone 'Europe/London')
      else null
    end as proposed_start_at,
    case
      when staging_end_raw ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
        then (staging_end_raw::timestamp at time zone 'Europe/London')
      else null
    end as proposed_end_at
  from bst_window
)
select
  reference,
  source,
  start_at as current_start_at,
  start_london as current_start_london_display,
  raw_intended_arrival,
  proposed_start_at,
  end_at as current_end_at,
  end_london as current_end_london_display,
  raw_intended_return,
  proposed_end_at
from flagged
where likely_bst_period
  and proposed_start_at is not null
  and proposed_end_at is not null
  and proposed_start_at is distinct from start_at
order by reference;
