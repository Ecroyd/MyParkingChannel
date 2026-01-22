# Test the Automatic Parser

## Quick Test

### 1. Parse a specific file

```powershell
# Replace with your actual file ID and tenant ID
$fileId = "71395db3-5e2c-4ebc-9ed2-a1b875929c7e"
$tenantId = "your-tenant-uuid-here"

$body = @{
    fileId = $fileId
    tenantId = $tenantId
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3002/api/admin/ingest/parse-file" `
    -Method POST `
    -Headers @{ "content-type" = "application/json" } `
    -Body $body
```

### 2. Parse all pending files

```powershell
# Replace with your tenant ID
$tenantId = "your-tenant-uuid-here"

$body = @{
    tenantId = $tenantId
    limit = 10
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3002/api/admin/ingest/parse-pending" `
    -Method POST `
    -Headers @{ "content-type" = "application/json" } `
    -Body $body
```

## Verify Results

After parsing, check:

```sql
-- 1. File status updated?
SELECT 
  f.id,
  f.filename,
  f.parse_status,
  f.parse_error,
  f.parsed_at
FROM ingest_email_files f
WHERE f.id = '71395db3-5e2c-4ebc-9ed2-a1b875929c7e';

-- 2. Import run created?
SELECT 
  ir.id,
  ir.inserted_count,
  ir.error_count,
  ir.created_at,
  ir.meta
FROM import_runs ir
WHERE ir.meta->>'email_file_id' = '71395db3-5e2c-4ebc-9ed2-a1b875929c7e'
ORDER BY ir.created_at DESC;

-- 3. Bookings created?
SELECT 
  b.id,
  b.reference,
  b.customer_name,
  b.start_at,
  b.end_at,
  b.source,
  b.created_at
FROM bookings b
WHERE b.created_at > NOW() - INTERVAL '1 hour'
ORDER BY b.created_at DESC
LIMIT 20;
```

## Expected Response

```json
{
  "ok": true,
  "fileId": "71395db3-5e2c-4ebc-9ed2-a1b875929c7e",
  "filename": "APH.csv             .txt",
  "rowsParsed": 15,
  "importResult": {
    "runId": "import-run-uuid",
    "successCount": 15,
    "errorCount": 0
  }
}
```
