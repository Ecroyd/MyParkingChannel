# Troubleshooting: Attachments Not Appearing in Storage

## Quick Diagnostic Queries

### 1. Check if attachments are being received
```sql
-- Check recent emails and attachment counts
SELECT 
  e.id,
  e.created_at,
  e.from_address,
  e.subject,
  LENGTH(e.raw_rfc822_base64) AS email_size,
  COUNT(f.id) AS file_count
FROM ingest_emails e
LEFT JOIN ingest_email_files f ON f.email_id = e.id
WHERE e.created_at > NOW() - INTERVAL '1 hour'
GROUP BY e.id
ORDER BY e.created_at DESC;
```

### 2. Check for failed storage uploads
```sql
-- See files that failed to upload
SELECT 
  f.id,
  f.filename,
  f.parse_status,
  f.parse_error,
  f.created_at,
  e.from_address,
  e.subject
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
WHERE f.parse_status = 'failed'
ORDER BY f.created_at DESC;
```

### 3. Check API response logs
Look in Vercel Function logs for:
- `attachmentsReceived: 0` → Worker not sending attachments
- `Storage upload failed` → Bucket/permission issue
- `No attachments in email` → Email had no attachments

## Common Issues

### Issue 1: Worker Not Sending Attachments

**Symptoms:**
- `attachmentsReceived: 0` in logs
- Email size still ~350 bytes (stub_only)

**Solution:**
1. Verify Worker is using `cloudflare-worker-email-ingest.js` code
2. Check Worker logs in Cloudflare Dashboard
3. Ensure `postal-mime` is installed in Worker
4. Test by sending email with attachment

### Issue 2: Bucket Doesn't Exist

**Symptoms:**
- `Storage upload failed: Bucket not found` error
- Files in `ingest_email_files` with `parse_status = 'failed'`

**Solution:**
1. Go to Supabase → Storage
2. Create bucket: `email-imports`
3. Set visibility: **Private** (service role can still access)
4. Retry by sending another test email

### Issue 3: Storage Permissions

**Symptoms:**
- `Storage upload failed: new row violates row-level security policy`

**Solution:**
1. Service role should bypass RLS automatically
2. Verify `SUPABASE_SERVICE_ROLE_KEY` is set correctly
3. Check bucket policies in Supabase Storage settings

### Issue 4: Email Has No Attachments

**Symptoms:**
- `No attachments in email` in logs
- Email received but no files

**Solution:**
- This is expected if the email doesn't have attachments
- Test with an email that definitely has a CSV/txt file attached

## Testing Steps

1. **Send test email with attachment:**
   - To: `bookings@myparkingchannel.app`
   - Attach a small CSV or TXT file
   - Subject: "TEST ATTACHMENT"

2. **Check API response:**
   - Look in Vercel logs for `[ingest-email]` entries
   - Should show `attachmentsReceived: 1` (or more)

3. **Check database:**
   ```sql
   SELECT * FROM ingest_email_files 
   WHERE created_at > NOW() - INTERVAL '10 minutes'
   ORDER BY created_at DESC;
   ```

4. **Check storage:**
   - Go to Supabase → Storage → email-imports
   - Should see files organized by email_id

## Debugging Checklist

- [ ] Worker code updated with postal-mime?
- [ ] `postal-mime` installed in Worker?
- [ ] Worker deployed?
- [ ] `email-imports` bucket exists in Supabase?
- [ ] Bucket is Private (not Public)?
- [ ] Test email actually has attachment?
- [ ] Check Vercel logs for error messages
- [ ] Check Cloudflare Worker logs for errors
