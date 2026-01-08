# ANPR Relay Example - PowerShell script to POST ANPR events to Parking Channel
# Generic example - not tied to any specific ANPR system
#
# Usage:
#   .\anpr-relay-example.ps1 -TenantId "your-tenant-id" -RelayToken "your-relay-token" -Plate "AB12CDE" -Direction "in"
#
# Environment variables (optional):
#   $env:ANPR_RELAY_URL - Base URL (default: http://localhost:3000)
#   $env:ANPR_TENANT_ID - Default tenant ID
#   $env:ANPR_RELAY_TOKEN - Default relay token

param(
    [Parameter(Mandatory=$false)]
    [string]$TenantId = $env:ANPR_TENANT_ID,
    
    [Parameter(Mandatory=$false)]
    [string]$RelayToken = $env:ANPR_RELAY_TOKEN,
    
    [Parameter(Mandatory=$true)]
    [string]$Plate,
    
    [Parameter(Mandatory=$true)]
    [ValidateSet("in", "out", "unknown")]
    [string]$Direction,
    
    [Parameter(Mandatory=$false)]
    [string]$EventAt = (Get-Date -Format "o"),  # ISO 8601 format
    
    [Parameter(Mandatory=$false)]
    [string]$CameraId = $null,
    
    [Parameter(Mandatory=$false)]
    [double]$Confidence = $null,
    
    [Parameter(Mandatory=$false)]
    [string]$SnapshotUrl = $null,
    
    [Parameter(Mandatory=$false)]
    [string]$BaseUrl = $env:ANPR_RELAY_URL
)

# Set default base URL if not provided
if (-not $BaseUrl) {
    $BaseUrl = "http://localhost:3000"
}

# Validate required parameters
if (-not $TenantId) {
    Write-Error "TenantId is required. Set -TenantId parameter or ANPR_TENANT_ID environment variable."
    exit 1
}

if (-not $RelayToken) {
    Write-Error "RelayToken is required. Set -RelayToken parameter or ANPR_RELAY_TOKEN environment variable."
    exit 1
}

# Build the API endpoint URL
$url = "$BaseUrl/api/anpr/events?tenantId=$TenantId"

# Build the request body
$bodyObj = @{
    plate = $Plate
    event_at = $EventAt
    direction = $Direction
}

# Add optional fields if provided
if ($CameraId) {
    $bodyObj["camera_id"] = $CameraId
}

if ($Confidence) {
    $bodyObj["confidence"] = $Confidence
}

if ($SnapshotUrl) {
    $bodyObj["snapshot_url"] = $SnapshotUrl
}

$body = $bodyObj | ConvertTo-Json

# Prepare headers
$headers = @{
    "Content-Type" = "application/json"
    "x-relay-token" = $RelayToken
}

# Make the request
try {
    Write-Host "POSTing ANPR event to: $url" -ForegroundColor Cyan
    Write-Host "Body: $body" -ForegroundColor Gray
    
    $response = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $body -ErrorAction Stop
    
    Write-Host "Success!" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Depth 10) -ForegroundColor Green
    
    return $response
} catch {
    Write-Error "Failed to POST ANPR event: $_"
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response body: $responseBody" -ForegroundColor Red
    }
    
    exit 1
}

# Example usage:
# .\anpr-relay-example.ps1 -TenantId "123e4567-e89b-12d3-a456-426614174000" -RelayToken "your-token-here" -Plate "AB12CDE" -Direction "in" -CameraId "camera-01" -Confidence 0.95

