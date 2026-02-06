begin;

-- Replace gate status check to include key/no-show workflow values.
-- Allow NULL (UI "— Status —") or one of the allowed values.
alter table public.bookings
  drop constraint if exists check_gate_status;

alter table public.bookings
  add constraint check_gate_status
  check (
    gate_status is null
    or (gate_status)::text = any (
      (array[
        'reserved'::character varying,
        'arrived'::character varying,
        'departed'::character varying,
        'cancelled'::character varying,
        'no_show'::character varying,
        'take_key'::character varying,
        'arrived_key_taken'::character varying
      ])::text[]
    )
  );

commit;
