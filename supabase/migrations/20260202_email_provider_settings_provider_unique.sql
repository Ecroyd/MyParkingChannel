-- Allow upsert on provider: unique constraint for email_provider_settings(provider)
CREATE UNIQUE INDEX IF NOT EXISTS email_provider_settings_provider_key
  ON public.email_provider_settings(provider);
