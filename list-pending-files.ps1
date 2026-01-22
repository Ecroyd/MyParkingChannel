# List pending files that need parsing
# Usage: .\list-pending-files.ps1

param(
    [string]$BaseUrl = "http://localhost:3002",
    [int]$Limit = 20
)

Write-Host "`n🔍 Fetching pending files..." -ForegroundColor Cyan

# You'll need to query Supabase directly or create an API endpoint
# For now, this is a helper script to show the SQL query

Write-Host "`nRun this SQL in Supabase SQL Editor:" -ForegroundColor Yellow
Write-Host @"
SELECT 
  f.id AS file_id,
  f.filename,
  f.parse_status,
  f.created_at,
  e.from_address,
  e.subject,
  e.id AS email_id
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
WHERE f.parse_status = 'pending'
ORDER BY f.created_at DESC
LIMIT $Limit;
"@ -ForegroundColor White

Write-Host "`nThen use test-parse-file-manual.ps1 with the file_id and tenant_id" -ForegroundColor Cyan
