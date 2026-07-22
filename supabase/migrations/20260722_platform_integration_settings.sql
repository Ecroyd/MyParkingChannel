-- Platform-level integration credentials (Google Places, etc.)
-- API keys stored encrypted (base64 ciphertext matching existing email_provider_settings pattern).
-- Never expose ciphertext or plaintext keys to browser clients.

create table if not exists public.platform_integration_settings (
  id uuid primary key default gen_random_uuid(),
  integration_key text not null unique,
  api_key_encrypted text,
  is_enabled boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.platform_integration_settings is
  'Platform-wide third-party API credentials. Server-only; never return api_key_encrypted to clients.';

alter table public.platform_integration_settings enable row level security;

-- No anon/authenticated policies: access via service role / admin client only.

insert into public.platform_integration_settings (integration_key, is_enabled, metadata)
values ('google_places', false, '{}'::jsonb)
on conflict (integration_key) do nothing;
