# Script to verify API key hash matches database
# This helps debug API key authentication issues

$apiKey = "Ced529985232efefae56dd53703e17025c4446fd34f21c9ebf4797a61838994e"

Write-Host "API Key Verification" -ForegroundColor Cyan
Write-Host "===================" -ForegroundColor Cyan
Write-Host ""
Write-Host "API Key: $apiKey" -ForegroundColor Gray
Write-Host "Length: $($apiKey.Length) characters" -ForegroundColor Gray
Write-Host ""

# Calculate SHA256 hash
Add-Type -AssemblyName System.Security
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$bytes = [System.Text.Encoding]::UTF8.GetBytes($apiKey)
$hashBytes = $sha256.ComputeHash($bytes)
$hashHex = ($hashBytes | ForEach-Object { $_.ToString("x2") }) -join ""

Write-Host "SHA256 Hash: $hashHex" -ForegroundColor Yellow
Write-Host ""
Write-Host "Use this SQL query in Supabase to find the matching key:" -ForegroundColor Cyan
Write-Host ""
Write-Host "SELECT" -ForegroundColor Green
Write-Host "  id," -ForegroundColor Green
Write-Host "  name," -ForegroundColor Green
Write-Host "  scopes," -ForegroundColor Green
Write-Host "  is_test," -ForegroundColor Green
Write-Host "  is_active," -ForegroundColor Green
Write-Host "  created_at," -ForegroundColor Green
Write-Host "  last_used_at" -ForegroundColor Green
Write-Host "FROM partner_api_keys" -ForegroundColor Green
Write-Host "WHERE api_key_hash = '$hashHex';" -ForegroundColor Green
Write-Host ""
Write-Host "Or search by name:" -ForegroundColor Cyan
Write-Host "SELECT * FROM partner_api_keys WHERE name LIKE '%CAVU%' ORDER BY created_at DESC;" -ForegroundColor Green
