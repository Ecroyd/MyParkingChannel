-- Site visitors (/admin/visitors): who is on a car park's public booking site and where they came
-- from. Written by POST /api/public/track (a beacon from every tenant site page), read by
-- /api/admin/visitors. Server-only (service role), so RLS is on with no policies.
--
-- Cookieless: `visitor` is a hash of a salt that changes every day, the car park, the IP address
-- and the browser, so a person counts once per day and can't be followed from one day to the next.
-- No IP address or user agent is stored.

create table if not exists public.site_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- pageview: a page was opened. checkout: the visitor went on to payment. ping: still on the page.
  event text not null check (event in ('pageview', 'checkout', 'ping')),
  visitor text not null,
  path text not null default '/',
  -- First page of a visit (arrived from another site, a search, an ad or typed the address).
  entry boolean not null default false,
  source text,          -- e.g. Google, Facebook, Bing, Direct, a referring site, or utm_source
  medium text,          -- organic, paid, social, referral, email, direct, or utm_medium
  campaign text,        -- utm_campaign
  referrer_host text,
  country text,         -- ISO code from the edge (x-vercel-ip-country)
  device text check (device is null or device in ('mobile', 'tablet', 'desktop'))
);

create index if not exists site_events_tenant_created_idx
  on public.site_events (tenant_id, created_at desc);

alter table public.site_events enable row level security;

-- Everything the Visitors page shows for one car park and date range, in one round trip.
-- Each visit is credited to the source of the visitor's first entry that day.
create or replace function public.site_visitor_stats(
  p_tenant uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_tz text default 'Europe/London'
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ev as (
    select * from site_events
    where tenant_id = p_tenant and created_at >= p_from and created_at < p_to and event <> 'ping'
  ),
  first_entry as (
    select distinct on (visitor)
      visitor,
      coalesce(source, 'Direct') as source,
      coalesce(medium, 'direct') as medium
    from ev
    where event = 'pageview' and entry
    order by visitor, created_at
  ),
  per_visitor as (
    select
      v.visitor,
      coalesce(f.source, 'Direct') as source,
      coalesce(f.medium, 'direct') as medium,
      bool_or(v.event = 'checkout') as checked_out
    from ev v
    left join first_entry f using (visitor)
    group by v.visitor, f.source, f.medium
  )
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'visitors', count(distinct visitor),
        'visits', count(*) filter (where event = 'pageview' and entry),
        'pageviews', count(*) filter (where event = 'pageview'),
        'checkouts', count(distinct visitor) filter (where event = 'checkout')
      ) from ev
    ),
    'daily', coalesce((
      select jsonb_agg(d order by d.day) from (
        select
          to_char((created_at at time zone p_tz)::date, 'YYYY-MM-DD') as day,
          count(distinct visitor) as visitors,
          count(*) filter (where event = 'pageview') as pageviews,
          count(distinct visitor) filter (where event = 'checkout') as checkouts
        from ev
        group by 1
      ) d
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(s order by s.visitors desc) from (
        select source, medium,
          count(*) as visitors,
          count(*) filter (where checked_out) as checkouts
        from per_visitor
        group by source, medium
        order by count(*) desc
        limit 25
      ) s
    ), '[]'::jsonb),
    'campaigns', coalesce((
      select jsonb_agg(c order by c.visits desc) from (
        select campaign, coalesce(source, 'Direct') as source, count(*) as visits
        from ev
        where event = 'pageview' and entry and campaign is not null
        group by campaign, coalesce(source, 'Direct')
        order by count(*) desc
        limit 25
      ) c
    ), '[]'::jsonb),
    'referrers', coalesce((
      select jsonb_agg(r order by r.visits desc) from (
        select referrer_host, count(*) as visits
        from ev
        where event = 'pageview' and entry and referrer_host is not null
        group by referrer_host
        order by count(*) desc
        limit 25
      ) r
    ), '[]'::jsonb),
    'landing_pages', coalesce((
      select jsonb_agg(l order by l.visits desc) from (
        select path, count(*) as visits
        from ev
        where event = 'pageview' and entry
        group by path
        order by count(*) desc
        limit 25
      ) l
    ), '[]'::jsonb),
    'pages', coalesce((
      select jsonb_agg(p order by p.pageviews desc) from (
        select path, count(*) as pageviews, count(distinct visitor) as visitors
        from ev
        where event = 'pageview'
        group by path
        order by count(*) desc
        limit 25
      ) p
    ), '[]'::jsonb),
    'countries', coalesce((
      select jsonb_agg(c order by c.visitors desc) from (
        select coalesce(country, '??') as country, count(distinct visitor) as visitors
        from ev
        group by 1
        order by count(distinct visitor) desc
        limit 25
      ) c
    ), '[]'::jsonb),
    'devices', coalesce((
      select jsonb_agg(d order by d.visitors desc) from (
        select coalesce(device, 'desktop') as device, count(distinct visitor) as visitors
        from ev
        group by 1
      ) d
    ), '[]'::jsonb)
  );
$$;

-- On the site right now: anyone with any event (pings included) in the last five minutes,
-- with the page they are on and where today's visit came from.
create or replace function public.site_visitors_live(p_tenant uuid, p_window_minutes int default 5)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with recent as (
    select distinct on (visitor) visitor, path, created_at, country, device
    from site_events
    where tenant_id = p_tenant and created_at > now() - make_interval(mins => p_window_minutes)
    order by visitor, created_at desc
  ),
  origin as (
    select distinct on (visitor) visitor, coalesce(source, 'Direct') as source
    from site_events
    where tenant_id = p_tenant
      and created_at > now() - interval '1 day'
      and event = 'pageview' and entry
      and visitor in (select visitor from recent)
    order by visitor, created_at
  )
  select jsonb_build_object(
    'count', (select count(*) from recent),
    'visitors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'path', r.path,
        'last_seen', r.created_at,
        'country', r.country,
        'device', r.device,
        'source', coalesce(o.source, 'Direct')
      ) order by r.created_at desc)
      from recent r left join origin o using (visitor)
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.site_visitor_stats(uuid, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.site_visitors_live(uuid, int) from public, anon, authenticated;
