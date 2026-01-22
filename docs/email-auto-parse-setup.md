# Email Auto-Parse Setup

Files are now automatically parsed when emails arrive (if tenant mapping is configured).

## Configuration

### Option 1: Environment Variable (Recommended)

Add to `.env.local` (dev) and Vercel (prod):

```bash
# Multiple emails can map to the same tenant
EMAIL_TENANT_MAP='{"jcecroyd@gmail.com":"bab45dab-19e8-4230-b18e-ee1f663608e5","info@flyparksexeter.co.uk":"bab45dab-19e8-4230-b18e-ee1f663608e5"}'
```

Or map by domain:

```bash
EMAIL_TENANT_MAP='{"gmail.com":"your-tenant-uuid-here","myparkingchannel.app":"your-tenant-uuid-here"}'
```

### Option 2: Code Configuration

Edit `src/app/api/ingest/email/route.ts` and update the `getEmailTenantMap()` function:

```typescript
return {
  // Multiple emails can map to the same tenant
  "jcecroyd@gmail.com": "bab45dab-19e8-4230-b18e-ee1f663608e5",
  "info@flyparksexeter.co.uk": "bab45dab-19e8-4230-b18e-ee1f663608e5",
  // Add more as needed:
  // "another@email.com": "bab45dab-19e8-4230-b18e-ee1f663608e5",
  
  // Or map by domain (all emails from that domain):
  // "flyparksexeter.co.uk": "bab45dab-19e8-4230-b18e-ee1f663608e5",
};
```

## How It Works

1. Email arrives → Cloudflare Worker sends to `/api/ingest/email`
2. Email stored → File extracted and stored in Supabase Storage
3. **Auto-parse triggered** → If tenant mapping exists, files are parsed immediately (async)
4. Bookings created → Parsed bookings are imported automatically

## Finding Your Tenant ID

Run in Supabase SQL Editor:

```sql
SELECT id, name, slug FROM tenants WHERE status = 'active';
```

## Testing

1. Send a test email with an attachment to `bookings@myparkingchannel.app`
2. Check logs - you should see:
   ```
   [ingest-email] Auto-parsing 1 files for tenant <uuid>
   [ingest-email] Auto-parsed file <uuid>: 15 bookings
   ```
3. Verify bookings were created:
   ```sql
   SELECT COUNT(*) FROM bookings 
   WHERE created_at > NOW() - INTERVAL '5 minutes';
   ```

## Manual Override

If auto-parse doesn't trigger (no tenant mapping), you can still manually parse:

```powershell
.\test-parse-file.ps1 -FileId "file-uuid" -TenantId "tenant-uuid"
```

Or use the API directly:
```powershell
$body = @{ fileId = "file-uuid"; tenantId = "tenant-uuid" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3002/api/admin/ingest/parse-file" -Method POST -Body $body
```
