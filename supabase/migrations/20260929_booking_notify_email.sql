-- Explicit multi-recipient list for internal "New booking" notifications.
-- Sent directly via Resend to these addresses — no Cloudflare forwarder required.
-- No tenant-specific seeds (multi-tenant SaaS: each tenant configures in Admin UI).

ALTER TABLE public.tenant_email_settings
  ADD COLUMN IF NOT EXISTS booking_notify_emails text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.tenant_email_settings.booking_notify_emails IS
  'Internal New booking notification recipients (Resend To:). Empty = do not send tenant notify.';

-- Migrate legacy singular column if an earlier migration added it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tenant_email_settings'
      AND column_name = 'booking_notify_email'
  ) THEN
    UPDATE public.tenant_email_settings
    SET booking_notify_emails = ARRAY[btrim(booking_notify_email)]
    WHERE booking_notify_email IS NOT NULL
      AND btrim(booking_notify_email) <> ''
      AND (
        booking_notify_emails IS NULL
        OR cardinality(booking_notify_emails) = 0
      );
  END IF;
END $$;
