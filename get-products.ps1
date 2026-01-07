# Script to get products using the partner API
# This requires the API key to have the 'products' scope

$apiKey = "96e894dc772ee9560041dd092003f6ea9b612e6b8b3a31e1d3be9e04c10feec8"
$baseUrl = "https://myparkingchannel.app"

Write-Host "Fetching Products via API..." -ForegroundColor Cyan
Write-Host ""

$url = "$baseUrl/api/supplier/v1/products"
$headers = @{
    "X-API-Key" = $apiKey
}

try {
    $response = Invoke-WebRequest -Uri $url -Headers $headers -Method GET -ErrorAction Stop
    
    Write-Host "[SUCCESS] Products retrieved!" -ForegroundColor Green
    Write-Host ""
    
    $products = $response.Content | ConvertFrom-Json
    
    if ($products.Count -eq 0) {
        Write-Host "[WARNING] No products found. You may need to create a product first." -ForegroundColor Yellow
    } else {
        Write-Host "Found $($products.Count) product(s):" -ForegroundColor Green
        Write-Host ""
        
        foreach ($product in $products) {
            Write-Host "Product:" -ForegroundColor Cyan
            Write-Host "  ID: $($product.id)" -ForegroundColor Yellow
            Write-Host "  Code: $($product.code)" -ForegroundColor Gray
            Write-Host "  Name: $($product.name)" -ForegroundColor Gray
            Write-Host "  Active: $($product.is_active)" -ForegroundColor Gray
            Write-Host ""
        }
        
        # Suggest the first product or STANDARD product
        $standardProduct = $products | Where-Object { $_.code -eq "STANDARD" } | Select-Object -First 1
        $suggestedProduct = if ($standardProduct) { $standardProduct } else { $products[0] }
        
        Write-Host "Suggested product for testing:" -ForegroundColor Yellow
        Write-Host "  Product ID: $($suggestedProduct.id)" -ForegroundColor Green
        Write-Host ""
        Write-Host "Update test-cavu-api.ps1:" -ForegroundColor Cyan
        Write-Host "  `$productId = `"$($suggestedProduct.id)`"" -ForegroundColor Gray
    }
    
} catch {
    Write-Host "[ERROR] Failed to fetch products" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $statusCode = [int]$_.Exception.Response.StatusCode
        Write-Host "Status Code: $statusCode" -ForegroundColor Red
        
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        $reader.Close()
        
        Write-Host "Response:" -ForegroundColor Yellow
        try {
            $errorJson = $responseBody | ConvertFrom-Json
            $errorJson | ConvertTo-Json -Depth 10
        } catch {
            Write-Host $responseBody
        }
        
        if ($statusCode -eq 403) {
            Write-Host ""
            Write-Host "[INFO] Your API key doesn't have the 'products' scope." -ForegroundColor Yellow
            Write-Host "Use the SQL query from find-product-id.ps1 instead." -ForegroundColor Yellow
        }
    }
}

Write-Host ""
