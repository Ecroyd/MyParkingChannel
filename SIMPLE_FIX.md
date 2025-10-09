# Simple Fix for Domain Issue

## The Problem
The domain `parkingexeterairport.co.uk` is configured correctly in the database, but the site returns a 404 because the tenant is missing a `tenant_public_profile` record.

## Quick Fix (Database)

### Option 1: Use Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to Table Editor → `tenant_public_profile`
3. Click "Insert" → "Insert row"
4. Add this data:
   - `tenant_id`: `bab45dab-19e8-4230-b18e-ee1f663608e5`
   - `is_active`: `true`
   - `status`: `active`
   - `business_name`: `Fly Parks Exeter` (optional)
5. Save the row

### Option 2: Use SQL Editor
1. Go to Supabase Dashboard → SQL Editor
2. Run this query:

```sql
INSERT INTO tenant_public_profile (tenant_id, is_active, status, business_name) 
VALUES ('bab45dab-19e8-4230-b18e-ee1f663608e5', true, 'active', 'Fly Parks Exeter');
```

## Test the Fix

After adding the profile record:

1. **Test locally** (if you have the app running):
   ```bash
   # Add to hosts file: 127.0.0.1 parkingexeterairport.localhost
   # Then visit: http://parkingexeterairport.localhost:3000
   ```

2. **Test on production**:
   Visit: `https://parkingexeterairport.co.uk`

## Expected Result

The domain should now:
1. ✅ Resolve to `/site/parkingexeterairport.co.uk`
2. ✅ Find the tenant via `tenant_domains` table
3. ✅ Redirect to `/sites/flyparksexeter`
4. ✅ Load the site (no more 404)

## Why This Fixes It

The `getSiteContext` function in `/sites/[slug]/page.tsx` requires:
- Tenant status = 'active' ✅ (already exists)
- tenant_public_profile.is_active = true ❌ (missing - this is the fix)

Once you add the `tenant_public_profile` record, the site will be considered "published" and accessible.

## Alternative: Temporary Bypass

If you want to test without the profile, you can temporarily modify the `getSiteContext` function to bypass the profile check, but adding the profile record is the proper solution.
