-- Migration: Create RPC function for atomically claiming ANPR outbox items
-- Purpose: Lease-based model with explicit lease expiry timestamps
-- 
-- Lease Model:
--   pending = available to lease
--   processing = leased by a relay (5 minute lease)
--   If lease expires (relay crashes/SOAP fails/no ACK) → automatically requeue to pending
--   ACK success = mark completed
--   ACK failure = put back to pending + store error

create or replace function public.anpr_outbox_claim(
  p_tenant_id uuid,
  p_limit int,
  p_lease_seconds int
)
returns setof public.anpr_outbox
language plpgsql
as $$
begin
  return query
  with eligible as (
    select id
    from public.anpr_outbox
    where tenant_id = p_tenant_id
      and processed_at is null
      and (
        status = 'pending'
        or (status = 'processing' and lease_expires_at is not null and lease_expires_at < now())
        or (status = 'processing' and lease_expires_at is null) -- safety for older rows
      )
    order by created_at asc
    limit p_limit
    for update skip locked
  ),
  upd as (
    update public.anpr_outbox o
    set status = 'processing',
        leased_at = now(),
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        error_message = null
    where o.id in (select id from eligible)
    returning o.*
  )
  select * from upd;
end;
$$;

-- Grant execute permission to service role (for API routes)
GRANT EXECUTE ON FUNCTION anpr_outbox_claim(UUID, INTEGER, INTEGER) TO service_role;
