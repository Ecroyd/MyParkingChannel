-- On-site ANPR gateways (gateway 0.2.0+) report their version and status with every heartbeat:
-- recorder connection, last plate, reads waiting to send, last catch-up, last error. Shown on
-- Admin -> Settings -> ANPR so a site can be checked without anyone at the computer.
-- The heartbeat route tolerates these columns being absent, so this can be applied at any time.

alter table public.gate_devices
  add column if not exists gateway_version text,
  add column if not exists gateway_status jsonb,
  add column if not exists gateway_status_at timestamptz;
