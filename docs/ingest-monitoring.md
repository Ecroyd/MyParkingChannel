# Email Ingest Monitoring Guide

## How to Check if Bookings Were Uploaded

### Option 1: SQL Queries (Supabase SQL Editor)

#### Quick Status Check
```sql
-- See all emails with their processing status
SELECT 
  e.id,
  e.created_at AS received_at,
  e.from_address,
  e.subject,
  e.message_id,
  COUNT(f.id) AS attachment_count,
  COUNT(CASE WHEN f.parse_status = 'parsed' THEN 1 END) AS parsed_count,
  COUNT(CASE WHEN f.parse_status = 'failed' THEN 1 END) AS failed_count
FROM ingest_emails e
LEFT JOIN ingest_email_files f ON f.email_id = e.id
GROUP BY e.id
ORDER BY e.created_at DESC
LIMIT 20;
```

#### Check if Files Were Parsed
```sql
-- See files and their parse status
SELECT 
  f.id,
  f.filename,
  f.content_type,
  f.parse_status,
  f.parse_error,
  f.parsed_at,
  e.from_address,
  e.subject,
  e.created_at AS email_received_at
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
ORDER BY f.created_at DESC
LIMIT 20;
```

#### Check if Bookings Were Created
```sql
-- See bookings created from email imports
-- (Adjust this query based on how you link bookings to email imports)
SELECT 
  b.id,
  b.reference,
  b.customer_name,
  b.start_at,
  b.end_at,
  b.source,
  b.created_at
FROM bookings b
WHERE b.source = 'email_import'
  AND b.created_at > NOW() - INTERVAL '7 days'
ORDER BY b.created_at DESC;
```

#### Full Pipeline Status (Using View)
```sql
-- Use the ingest_status view (after running migration 015)
SELECT * FROM ingest_status
ORDER BY email_received_at DESC
LIMIT 20;
```

### Option 2: API Endpoint

Call the status API endpoint:

```bash
# Get last 50 emails
curl http://localhost:3002/api/admin/ingest/status

# Get last 10 emails
curl http://localhost:3002/api/admin/ingest/status?limit=10
```

Response format:
```json
{
  "ok": true,
  "count": 5,
  "emails": [
    {
      "email_id": "uuid",
      "email_received_at": "2026-01-20T12:00:00Z",
      "from_address": "supplier@example.com",
      "to_address": "bookings@myparkingchannel.app",
      "subject": "Daily Bookings",
      "message_id": "msg-id-123",
      "email_status": "received",
      "files": [
        {
          "file_id": "uuid",
          "filename": "bookings.csv",
          "content_type": "text/csv",
          "file_size": 12345,
          "parse_status": "parsed",
          "parse_error": null,
          "parsed_at": "2026-01-20T12:05:00Z"
        }
      ],
      "pipeline_status": "bookings_imported",
      "has_attachment": true,
      "has_parsed_file": true,
      "has_import_run": true
    }
  ]
}
```

### Option 3: Admin UI (Future)

You can build an admin page at `/admin/ingest/status` that displays this information in a table.

## Pipeline Status Values

- `no_attachment` - Email received but no attachment found
- `file_pending` - Attachment found but not yet parsed
- `file_parse_failed` - Attachment parsing failed (check `parse_error`)
- `file_parsed_not_imported` - File parsed but bookings not yet imported
- `bookings_imported` - ✅ Bookings successfully created
- `import_errors` - Import attempted but had errors
- `unknown` - Unexpected state

## Troubleshooting

### Email received but no attachment
- Check if supplier is actually attaching files
- Verify email format (some emails embed content instead of attachments)

### File pending forever
- Check if parsing job/cron is running
- Look for errors in logs

### Parse failed
- Check `parse_error` field in `ingest_email_files` table
- Verify file format matches expected CSV/txt structure

### File parsed but no bookings
- Check if import job is running
- Verify tenant_id mapping
- Check import_runs table for errors
