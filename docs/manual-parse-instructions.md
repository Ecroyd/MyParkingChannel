# Manual File Parsing

If files get stuck in `pending` status, you can manually trigger parsing.

## Quick Method (PowerShell)

1. **Get the file ID and tenant ID** from Supabase:
   ```sql
   SELECT 
     f.id AS file_id,
     f.filename,
     f.parse_status,
     e.from_address,
     'bab45dab-19e8-4230-b18e-ee1f663608e5' AS tenant_id  -- Your tenant ID
   FROM ingest_email_files f
   JOIN ingest_emails e ON e.id = f.email_id
   WHERE f.parse_status = 'pending'
   ORDER BY f.created_at DESC;
   ```

2. **Run the PowerShell script**:
   ```powershell
   .\test-parse-file-manual.ps1 -FileId "2518a096-de1c-4bde-b1d7-bf274a990162" -TenantId "bab45dab-19e8-4230-b18e-ee1f663608e5"
   ```

## API Method

You can also call the API directly:

```powershell
$body = @{
    fileId = "2518a096-de1c-4bde-b1d7-bf274a990162"
    tenantId = "bab45dab-19e8-4230-b18e-ee1f663608e5"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3002/api/admin/ingest/parse-file" `
    -Method POST `
    -Headers @{
        "Content-Type" = "application/json"
    } `
    -Body $body
```

## Check Results

After parsing, check:

1. **File status**:
   ```sql
   SELECT id, filename, parse_status, parse_error, parsed_at
   FROM ingest_email_files
   WHERE id = '2518a096-de1c-4bde-b1d7-bf274a990162';
   ```

2. **Staging rows**:
   ```sql
   SELECT * FROM booking_import_staging
   WHERE source_email_id = (
     SELECT email_id FROM ingest_email_files WHERE id = '2518a096-de1c-4bde-b1d7-bf274a990162'
   );
   ```

3. **Bookings created**:
   ```sql
   SELECT * FROM bookings
   WHERE created_at > NOW() - INTERVAL '5 minutes'
   AND source = 'other'
   AND external_source LIKE '%APH%'
   ORDER BY created_at DESC;
   ```
