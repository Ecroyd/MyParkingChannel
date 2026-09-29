-- Explicit inbox for "new booking" tenant notifications (manual + website).
-- Reply-To remains for customer reply routing and must not steal booking alerts
-- when set to a platform ops address.

ALTER TABLE public.tenant_email_settings
  ADD COLUMN IF NOT EXISTS booking_notify_email text;

COMMENT ON COLUMN public.tenant_email_settings.booking_notify_email IS
  'Where to send tenant_booking_notification emails for manual/website bookings. Falls back to public profile email.';

-- Fly Parks Exeter: ensure booking alerts go to the site inbox, not platform ops.
UPDATE public.tenant_public_profile
SET email = 'info@flyparksexeter.co.uk',
    updated_at = now()
WHERE tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
  AND (
    email IS NULL
    OR btrim(email) = ''
    OR lower(btrim(email)) = 'ops@myparkingchannel.app'
  );

UPDATE public.tenant_branding
SET contact_email = 'info@flyparksexeter.co.uk'
WHERE tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
  AND (
    contact_email IS NULL
    OR btrim(contact_email) = ''
    OR lower(btrim(contact_email)) = 'ops@myparkingchannel.app'
  );

INSERT INTO public.tenant_email_settings (
  tenant_id,
  booking_notify_email,
  reply_to,
  sender_domain_mode,
  updated_at
)
VALUES (
  'bab45dab-19e8-4230-b18e-ee1f663608e5',
  'info@flyparksexeter.co.uk',
  'info@flyparksexeter.co.uk',
  'platform',
  now()
)
ON CONFLICT (tenant_id) DO UPDATE
SET
  booking_notify_email = COALESCE(
    NULLIF(btrim(tenant_email_settings.booking_notify_email), ''),
    'info@flyparksexeter.co.uk'
  ),
  reply_to = CASE
    WHEN tenant_email_settings.reply_to IS NULL
      OR btrim(tenant_email_settings.reply_to) = ''
      OR lower(btrim(tenant_email_settings.reply_to)) = 'ops@myparkingchannel.app'
      THEN 'info@flyparksexeter.co.uk'
    ELSE tenant_email_settings.reply_to
  END,
  updated_at = now();
