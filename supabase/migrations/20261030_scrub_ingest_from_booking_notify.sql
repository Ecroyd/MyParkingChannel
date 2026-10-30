-- Remove platform Cloudflare ingest addresses from tenant notify recipient lists.
-- bookings@ / canary-bookings@ are inbound ingest only; Resend To: those addresses
-- re-enters the Email Worker and never reaches staff or creates app bookings.

UPDATE public.tenant_email_settings
SET booking_notify_emails = COALESCE(
  (
    SELECT array_agg(e ORDER BY ord)
    FROM unnest(booking_notify_emails) WITH ORDINALITY AS t(e, ord)
    WHERE lower(btrim(e)) NOT IN (
      'bookings@myparkingchannel.app',
      'canary-bookings@myparkingchannel.app'
    )
  ),
  '{}'::text[]
)
WHERE booking_notify_emails IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM unnest(booking_notify_emails) AS e
    WHERE lower(btrim(e)) IN (
      'bookings@myparkingchannel.app',
      'canary-bookings@myparkingchannel.app'
    )
  );

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
    SET booking_notify_email = NULL
    WHERE booking_notify_email IS NOT NULL
      AND lower(btrim(booking_notify_email)) IN (
        'bookings@myparkingchannel.app',
        'canary-bookings@myparkingchannel.app'
      );
  END IF;
END $$;
