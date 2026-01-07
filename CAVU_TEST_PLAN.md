# CAVU Partner API Test Plan

## Overview
This document outlines the test plan for CAVU to test the partner API integration before going live. The test API key allows CAVU to verify that availability data is being sent correctly.

## Prerequisites

1. **Database Migration**: Run the migration `008_partner_api_test_mode.sql` in your Supabase SQL editor
2. **Test API Key Created**: Create a test API key in the admin panel with the "Test API Key" toggle enabled
3. **Availability Scope**: Ensure the test API key has the `availability` scope enabled

## Step 1: Create Test API Key

1. Navigate to **Admin > Partner APIs**
2. Click **"Create API Key"**
3. Fill in the form:
   - **Partner Name**: `CAVU Test`
   - **Partner Code**: `cavu_test` (optional, creates a channel)
   - **Scopes**: Check `availability` (and any others needed)
   - **Test API Key**: ✅ **Enable this toggle**
4. Click **"Create Key"**
5. **IMPORTANT**: Copy the API key immediately - it will only be shown once!

## Step 2: Verify Test Key in Database

Run this query in Supabase SQL editor to verify the test key was created:

```sql
SELECT 
  id,
  name,
  scopes,
  is_test,
  is_active,
  created_at
FROM partner_api_keys
WHERE name LIKE '%CAVU%' AND is_test = true
ORDER BY created_at DESC;
```

Expected result:
- `is_test` should be `true`
- `is_active` should be `true`
- `scopes` should include `'availability'`

## Step 3: Test Availability Endpoint

### Base URL
- **Production**: `https://yourdomain.com/api/supplier/v1/availability`
- **Test**: Use the same endpoint (test keys work on the same endpoint)

### Authentication
Include the API key in the request header:
```
X-API-Key: <your-test-api-key>
```

### Test Request Examples

#### Example 1: Basic Availability Check
```bash
curl -X GET \
  "https://yourdomain.com/api/supplier/v1/availability?product_id=tenant_pool&start_at=2026-01-10T08:00:00Z&end_at=2026-01-15T18:00:00Z&currency=GBP" \
  -H "X-API-Key: <your-test-api-key>"
```

#### Example 2: With Channel Code
```bash
curl -X GET \
  "https://yourdomain.com/api/supplier/v1/availability?product_id=tenant_pool&start_at=2026-01-10T08:00:00Z&end_at=2026-01-15T18:00:00Z&currency=GBP&channel_code=agent" \
  -H "X-API-Key: <your-test-api-key>"
```

### Expected Response Format

```json
{
  "product_id": "tenant_pool",
  "start_at": "2026-01-10T08:00:00Z",
  "end_at": "2026-01-15T18:00:00Z",
  "currency": "GBP",
  "availability_status": "available",
  "remaining_capacity": 42,
  "pricing": {
    "rate_plan": "standard",
    "days": 5,
    "base_price": 50.0,
    "surcharges": [],
    "discounts": [],
    "total_price": 50.0
  }
}
```

## Step 4: Test Scenarios

### Scenario 1: Valid Date Range
- **Test**: Request availability for a date range 7 days in the future
- **Expected**: Returns availability with pricing
- **Verify**: 
  - `availability_status` is `"available"` or `"limited"` or `"closed"`
  - `remaining_capacity` is a number or `null`
  - `pricing.total_price` is a positive number

### Scenario 2: Invalid Date Range
- **Test**: Request with `start_at` after `end_at`
- **Expected**: Returns error `INVALID_REQUEST`
- **Verify**: Error message indicates invalid date range

### Scenario 3: Missing Required Parameters
- **Test**: Request without `start_at` or `end_at`
- **Expected**: Returns error `INVALID_REQUEST`
- **Verify**: Error message indicates missing parameters

### Scenario 4: Invalid API Key
- **Test**: Request with invalid or missing API key
- **Expected**: Returns error `UNAUTHORIZED`
- **Verify**: Error code is `UNAUTHORIZED`

### Scenario 5: No Availability Scope
- **Test**: If a test key is created without `availability` scope
- **Expected**: Returns error `FORBIDDEN`
- **Verify**: Error message indicates scope not granted

### Scenario 6: Different Currencies
- **Test**: Request with `currency=USD`, `currency=EUR`
- **Expected**: Returns availability with pricing in requested currency
- **Verify**: Currency conversion is applied correctly

## Step 5: Monitor API Usage

Check the `last_used_at` field to verify API calls are being made:

```sql
SELECT 
  name,
  is_test,
  last_used_at,
  scopes
FROM partner_api_keys
WHERE name LIKE '%CAVU%'
ORDER BY last_used_at DESC;
```

## Step 6: Production Key Creation

Once testing is complete and CAVU confirms everything works:

1. Create a **new** API key (do NOT reuse the test key)
2. **Do NOT** enable the "Test API Key" toggle
3. This will be the production key
4. Share the production key with CAVU securely

## Important Notes

1. **Test keys work identically to production keys** - they use the same endpoints and logic
2. **Test keys are marked for identification** - they appear with a "Test" badge in the admin panel
3. **Both test and production keys can be active simultaneously** - useful for parallel testing
4. **Test keys should be deactivated after testing** - to avoid confusion
5. **Availability is real-time** - test keys will return actual availability data from your system

## Troubleshooting

### Issue: API key not working
- **Check**: Key is copied correctly (no extra spaces)
- **Check**: Key is active (`is_active = true`)
- **Check**: Key has `availability` scope
- **Check**: Header name is `X-API-Key` (case-insensitive)

### Issue: Getting 401 Unauthorized
- **Check**: API key is correct
- **Check**: Key is active in database
- **Check**: Header is being sent correctly

### Issue: Getting 403 Forbidden
- **Check**: Key has `availability` scope enabled
- **Check**: Scopes array includes `'availability'`

### Issue: Getting 400 Bad Request
- **Check**: Date format is ISO 8601 (e.g., `2026-01-10T08:00:00Z`)
- **Check**: `start_at` is before `end_at`
- **Check**: `product_id` is a valid UUID (or `tenant_pool`)

### Issue: No availability returned
- **Check**: Capacity is set for the requested dates
- **Check**: Products are active
- **Check**: Pricing rules are configured

## Support

If issues persist:
1. Check the API response for detailed error messages
2. Review server logs for authentication errors
3. Verify database migration was applied correctly
4. Confirm test key exists and is active in `partner_api_keys` table

## Next Steps After Testing

1. ✅ CAVU confirms test API works correctly
2. ✅ Create production API key (without test toggle)
3. ✅ Share production key securely with CAVU
4. ✅ Deactivate test key (optional, for cleanup)
5. ✅ Monitor production key usage via `last_used_at` field
