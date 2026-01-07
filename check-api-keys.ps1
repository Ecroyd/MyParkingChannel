# Script to check API keys against database hashes
# This helps identify which API key you need to use

Write-Host "CAVU API Key Checker" -ForegroundColor Cyan
Write-Host "====================" -ForegroundColor Cyan
Write-Host ""

# Database hashes from your query
$databaseHashes = @{
    "CAVU_TEST" = "b1190ec223b97d36e6e2eb0da8a0d4e6ddf6fc14d9124db57f1f3e54ad686576"
    "CAVU" = "dd88cdb2d1c87ce207f59ded355598098539e1d68724aaaed946e6c565091859"
}

# Current key in script
$currentKey = "96e894dc772ee9560041dd092003f6ea9b612e6b8b3a31e1d3be9e04c10feec8"

Write-Host "Current API Key in Script:" -ForegroundColor Yellow
Write-Host "  Key: $($currentKey.Substring(0, 16))...$($currentKey.Substring(48))" -ForegroundColor Gray

# Calculate hash
Add-Type -AssemblyName System.Security
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$bytes = [System.Text.Encoding]::UTF8.GetBytes($currentKey)
$hashBytes = $sha256.ComputeHash($bytes)
$currentHash = ($hashBytes | ForEach-Object { $_.ToString("x2") }) -join ""

Write-Host "  Hash: $currentHash" -ForegroundColor Gray
Write-Host ""

# Check against database
Write-Host "Database Keys:" -ForegroundColor Yellow
$matchFound = $false
foreach ($keyName in $databaseHashes.Keys) {
    $dbHash = $databaseHashes[$keyName]
    $matches = $currentHash -eq $dbHash
    if ($matches) {
        Write-Host "  [MATCH] ${keyName}: MATCHES!" -ForegroundColor Green
        $matchFound = $true
    } else {
        Write-Host "  [NO MATCH] ${keyName}: No match" -ForegroundColor Red
        Write-Host "     DB Hash: $dbHash" -ForegroundColor Gray
    }
}

Write-Host ""

if (-not $matchFound) {
    Write-Host "[WARNING] The API key in your script doesn't match any database keys!" -ForegroundColor Red
    Write-Host ""
    Write-Host "To fix this:" -ForegroundColor Yellow
    Write-Host "1. Go to Admin > Partner APIs in your app" -ForegroundColor Cyan
    Write-Host "2. Create a NEW test API key for CAVU" -ForegroundColor Cyan
    Write-Host "3. Copy the raw API key immediately (it's only shown once!)" -ForegroundColor Cyan
    Write-Host "4. Update the `$apiKey variable in test-cavu-api.ps1" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Or if you have the raw key saved somewhere:" -ForegroundColor Yellow
    Write-Host "1. Update test-cavu-api.ps1 with the correct raw API key" -ForegroundColor Cyan
    Write-Host "2. Run this script again to verify it matches" -ForegroundColor Cyan
} else {
    Write-Host "[SUCCESS] Your API key is correct! You can run test-cavu-api.ps1 now." -ForegroundColor Green
}

Write-Host ""
