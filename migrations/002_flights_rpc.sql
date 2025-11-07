-- RPC function to get flights for today with booking counts
-- This function computes "today" in the requested timezone and returns flights with passenger counts

create or replace function public.get_flights_today_with_counts(p_tenant_id uuid, p_tz text)
returns jsonb
language plpgsql
as $$
declare
  today_local date;
  result jsonb;
begin
  -- Compute "today" in requested timezone
  select (now() at time zone p_tz)::date into today_local;

  with base as (
    select fi.*
    from flight_instances fi
    where fi.tenant_id = p_tenant_id
      and fi.flight_date = today_local
  ),
  counts as (
    select b.flight_number::text as flight_number,
           b.flight_date::date as flight_date,
           b.direction::text as direction,
           count(*) as pax_count
    from bookings b
    where b.tenant_id = p_tenant_id
      and b.flight_date = today_local
      and b.flight_number is not null
      and b.direction in ('arrival','departure')
    group by 1,2,3
  ),
  joined as (
    select
      base.flight_number,
      base.flight_date,
      base.airline_iata,
      base.dep_airport_iata,
      base.arr_airport_iata,
      base.scheduled_departure,
      base.scheduled_arrival,
      base.estimated_departure,
      base.estimated_arrival,
      base.status,
      coalesce(arr.pax_count,0) as arrivals_count,
      coalesce(dep.pax_count,0) as departures_count
    from base
    left join counts arr on arr.flight_number = base.flight_number 
      and arr.flight_date = base.flight_date 
      and arr.direction='arrival'
    left join counts dep on dep.flight_number = base.flight_number 
      and dep.flight_date = base.flight_date 
      and dep.direction='departure'
  )
  select jsonb_agg(to_jsonb(joined)) into result from joined;

  return coalesce(result, '[]'::jsonb);
end
$$;

