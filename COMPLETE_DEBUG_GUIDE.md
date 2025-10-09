# Complete Domain Debug Guide

## Current Status
✅ Domain is properly configured in database  
✅ Tenant exists and is active  
❌ Site context is failing (likely missing tenant_public_profile)  
❌ Domain resolution is not working  

## Debug Steps

### Step 1: Test Site Context
```bash
curl "https://your-app.vercel.app/api/debug/site-context?slug=flyparksexeter"
```

**Expected**: Should show site context found  
**If fails**: Tenant needs a `tenant_public_profile` record

### Step 2: Test Domain Resolution  
```bash
curl "https://your-app.vercel.app/api/debug/domain?domain=parkingexeterairport.co.uk"
```

**Expected**: Should show tenant found  
**If fails**: Domain not in database

### Step 3: Test Complete Flow
Visit: `https://parkingexeterairport.co.uk`

**Expected logs**:
```
[MW] Custom domain rewrite: parkingexeterairport.co.uk → /site/parkingexeterairport.co.uk
🌐 [SITE] Resolving domain: parkingexeterairport.co.uk
✅ [SITE] Found tenant via tenant_domains: { slug: 'flyparksexeter' }
✅ [SITE] Redirecting to: /sites/flyparksexeter
```

## Likely Issues & Solutions

### Issue 1: Missing tenant_public_profile
**Symptom**: Site context returns null  
**Solution**: Create tenant_public_profile record

```sql
INSERT INTO tenant_public_profile (tenant_id, is_active, status) 
VALUES ('bab45dab-19e8-4230-b18e-ee1f663608e5', true, 'active');
```

### Issue 2: Domain Resolution Still Failing
**Symptom**: Site route can't find tenant  
**Solution**: Check admin client import

The site route now uses:
```typescript
const { createAdminClient } = await import('@/lib/supabase/server-admin')
const supabase = await createAdminClient()
```

### Issue 3: 404 at /sites/flyparksexeter
**Symptom**: Domain resolves but site page 404s  
**Solution**: Ensure tenant_public_profile exists and is active

## Quick Fix Commands

```bash
# Test site context
curl "https://your-app.vercel.app/api/debug/site-context?slug=flyparksexeter"

# Test domain resolution  
curl "https://your-app.vercel.app/api/debug/domain?domain=parkingexeterairport.co.uk"

# Test complete flow
curl "https://parkingexeterairport.co.uk"
```

## Database Requirements

For the domain to work, you need:

1. **tenant_domains** record ✅ (exists)
2. **tenants** record with status='active' ✅ (exists)  
3. **tenant_public_profile** record with is_active=true ❌ (likely missing)

## Next Steps

1. **Deploy the fixes** (admin client import)
2. **Test site context**: `/api/debug/site-context?slug=flyparksexeter`
3. **Create tenant_public_profile** if missing
4. **Test domain**: `https://parkingexeterairport.co.uk`

The issue is most likely that the tenant doesn't have a `tenant_public_profile` record, which is required for the site to be published and accessible.
