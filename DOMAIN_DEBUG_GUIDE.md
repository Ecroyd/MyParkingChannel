# Domain Debugging Guide for parkingexeterairport.co.uk

## Issue Summary
The domain `parkingexeterairport.co.uk` shows "valid configuration" in Vercel but doesn't work when visited. The expected flow should be:

1. User visits `https://parkingexeterairport.co.uk`
2. Vercel forwards to your app
3. Middleware runs and rewrites to `/site/parkingexeterairport.co.uk`
4. Site route resolves domain to tenant and redirects to `/sites/flyparksexeter`
5. User sees the tenant's site

## Debug Steps Added

### 1. Enhanced Middleware Logging
- Added comprehensive logging to `src/middleware.ts`
- Logs all requests with host, pathname, and timestamp
- Shows rewrite decisions for custom domains

### 2. Enhanced Site Route Logging
- Added detailed logging to `src/app/site/[domain]/page.tsx`
- Logs each database lookup attempt
- Shows Supabase connection status

### 3. Debug API Endpoints
Created two debug endpoints:

#### Check Domain Configuration
```
GET /api/debug/domain?domain=parkingexeterairport.co.uk
```
This will show:
- tenant_domains table lookup
- sites table lookup  
- site_domains table lookup
- Any database errors

#### Check Tenant Configuration
```
GET /api/debug/tenant?slug=flyparksexeter
```
This will show:
- Tenant existence and status
- Associated domains
- Associated sites

## How to Debug

### Step 1: Check Domain Configuration
Visit: `https://your-app.vercel.app/api/debug/domain?domain=parkingexeterairport.co.uk`

Expected result: Should show the domain is linked to a tenant with slug `flyparksexeter`

### Step 2: Check Tenant Exists
Visit: `https://your-app.vercel.app/api/debug/tenant?slug=flyparksexeter`

Expected result: Should show tenant exists and is active

### Step 3: Check Vercel Logs
1. Go to Vercel Dashboard → Your Project → Deployments
2. Click on the latest deployment
3. Go to "Function Logs" tab
4. Visit `https://parkingexeterairport.co.uk`
5. Look for middleware and site route logs

### Step 4: Test Locally
```bash
# Add to your hosts file (Windows: C:\Windows\System32\drivers\etc\hosts)
127.0.0.1 parkingexeterairport.localhost

# Run dev server
npm run dev

# Visit: http://parkingexeterairport.localhost:3000
```

## Common Issues & Solutions

### Issue 1: Domain Not in Database
**Symptom**: Debug API shows no tenant_domains entry
**Solution**: Add domain via admin panel or API

### Issue 2: Tenant Not Found
**Symptom**: Domain exists but tenant lookup fails
**Solution**: Check tenant status and slug spelling

### Issue 3: Middleware Not Running
**Symptom**: No middleware logs in Vercel
**Solution**: Ensure middleware.ts is in src/ and deployed

### Issue 4: Site Route Failing
**Symptom**: Middleware works but site route fails
**Solution**: Check Supabase connection and RLS policies

## Database Schema Check

Verify these tables exist and have data:

```sql
-- Check tenant_domains
SELECT * FROM tenant_domains WHERE domain = 'parkingexeterairport.co.uk';

-- Check tenants
SELECT * FROM tenants WHERE slug = 'flyparksexeter';

-- Check sites
SELECT * FROM sites WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'flyparksexeter');
```

## Next Steps

1. **Deploy the changes** - The enhanced logging will help identify the exact issue
2. **Test the debug endpoints** - Use them to verify database configuration
3. **Check Vercel logs** - Look for the detailed logging output
4. **Fix any issues found** - Based on the debug output, fix the specific problem

The enhanced logging will show exactly where the domain resolution is failing, making it much easier to fix the issue.
