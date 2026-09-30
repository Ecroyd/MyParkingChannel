/**
 * Deploy notes (Cloudflare Email Routing Worker)
 *
 * Symptom: mail to bookings@myparkingchannel.app never appears in ingest_emails
 * (no failure row either). MX still points at Cloudflare; Vercel /api/ingest/email
 * is healthy. Worker was dying BEFORE the POST (postal-mime CDN hang or
 * String.fromCharCode(...hugeBuffer) stack overflow).
 *
 * Fix in cloudflare-worker-email-ingest-fixed.js:
 * - POST raw RFC822 to INGEST_URL first
 * - Safe chunked base64 encoding
 * - No postal-mime in the worker (Next.js parses MIME server-side)
 *
 * Redeploy:
 * 1. Cloudflare Dashboard → Workers → your email ingest worker
 * 2. Paste contents of cloudflare-worker-email-ingest-fixed.js (or wrangler deploy)
 * 3. Confirm env: INGEST_URL=https://myparkingchannel.app/api/ingest/email
 *                INGEST_SECRET=<same as Vercel INGEST_SECRET>
 *                FALLBACK_FORWARD_TO=<ops inbox> (recommended)
 * 4. Email Routing → routes for bookings@ AND canary-bookings@ → this Worker
 * 5. Send a one-line test to bookings@; Admin → Email Ingest → Recent should show it
 */
