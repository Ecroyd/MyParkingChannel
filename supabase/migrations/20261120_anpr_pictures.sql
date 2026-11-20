-- ANPR pictures: the on-site gateway (0.3.0+) downloads each plate read's pictures from the
-- recorder and uploads them (POST /api/internal/anpr/picture). Stored privately in the
-- anpr-pictures bucket at <tenant>/<yyyy-mm-dd>/<gate event id>-<plate|scene>.jpg, viewed by
-- signed-in staff only through /api/admin/anpr/picture, and deleted after 90 days by
-- /api/internal/cron/anpr-pictures.
--
-- Off for every site until switched on (the gateway learns it from the heartbeat reply):
--   update public.tenant_anpr_config set capture_pictures = true where tenant_id = '<tenant id>';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anpr-pictures', 'anpr-pictures', false, 2097152, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

alter table public.gate_events
  add column if not exists plate_picture_path text,
  add column if not exists scene_picture_path text;

create index if not exists gate_events_pictures_event_at_idx
  on public.gate_events (event_at)
  where plate_picture_path is not null or scene_picture_path is not null;

alter table public.tenant_anpr_config
  add column if not exists capture_pictures boolean not null default false;
