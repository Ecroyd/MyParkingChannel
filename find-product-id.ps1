# Script to help find the product ID for testing
# This queries the database to find active products

Write-Host "Product ID Finder" -ForegroundColor Cyan
Write-Host "=================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To find your product ID, run this SQL query in Supabase:" -ForegroundColor Yellow
Write-Host ""
Write-Host "SELECT" -ForegroundColor Green
Write-Host "  id," -ForegroundColor Green
Write-Host "  code," -ForegroundColor Green
Write-Host "  name," -ForegroundColor Green
Write-Host "  is_active," -ForegroundColor Green
Write-Host "  created_at" -ForegroundColor Green
Write-Host "FROM products" -ForegroundColor Green
Write-Host "WHERE tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'" -ForegroundColor Green
Write-Host "  AND is_active = true" -ForegroundColor Green
Write-Host "ORDER BY created_at ASC;" -ForegroundColor Green
Write-Host ""
Write-Host "Or to get the STANDARD product (recommended):" -ForegroundColor Yellow
Write-Host ""
Write-Host "SELECT id, code, name" -ForegroundColor Green
Write-Host "FROM products" -ForegroundColor Green
Write-Host "WHERE tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'" -ForegroundColor Green
Write-Host "  AND code = 'STANDARD'" -ForegroundColor Green
Write-Host "  AND is_active = true" -ForegroundColor Green
Write-Host "LIMIT 1;" -ForegroundColor Green
Write-Host ""
Write-Host "Once you have the product ID (UUID), update test-cavu-api.ps1:" -ForegroundColor Cyan
Write-Host "  Change: `$productId = `"tenant_pool`"" -ForegroundColor Gray
Write-Host "  To:    `$productId = `"<your-product-uuid>`"" -ForegroundColor Gray
Write-Host ""
