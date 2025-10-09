# Fix Domain Issue: parkingexeterairport.co.uk

## The Problem
The domain `parkingexeterairport.co.uk` is not working because it's likely not configured in your database. The enhanced logging shows Supabase is connected, but the domain lookup is failing.

## Quick Fix Steps

### Step 1: Check Current Configuration
First, let's see what's in your database:

```bash
# Check if domain exists
curl "https://your-app.vercel.app/api/debug/domain?domain=parkingexeterairport.co.uk"

# Check if tenant exists  
curl "https://your-app.vercel.app/api/debug/tenant?slug=flyparksexeter"
```

### Step 2: Add Domain to Database
If the domain doesn't exist, add it using this API call:

```bash
curl -X POST "https://your-app.vercel.app/api/debug/add-domain" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "parkingexeterairport.co.uk",
    "tenantSlug": "flyparksexeter"
  }'
```

### Step 3: Alternative - Use Admin Panel
If you prefer the UI approach:

1. Go to your admin panel: `https://your-app.vercel.app/admin/domains`
2. Select the tenant with slug `flyparksexeter`
3. Add domain: `parkingexeterairport.co.uk`
4. Save

### Step 4: Test the Fix
After adding the domain:

1. Visit `https://parkingexeterairport.co.uk`
2. Check Vercel Function Logs for the detailed logging
3. The domain should now resolve to `/sites/flyparksexeter`

## Expected Database State

After the fix, you should have:

```sql
-- In tenant_domains table
INSERT INTO tenant_domains (tenant_id, domain, is_primary, verified) 
VALUES (
  (SELECT id FROM tenants WHERE slug = 'flyparksexeter'),
  'parkingexeterairport.co.uk',
  false,
  true
);
```

## Debugging Commands

```bash
# Test domain resolution
curl "https://your-app.vercel.app/api/debug/domain?domain=parkingexeterairport.co.uk"

# Test tenant lookup
curl "https://your-app.vercel.app/api/debug/tenant?slug=flyparksexeter"

# Add domain (if missing)
curl -X POST "https://your-app.vercel.app/api/debug/add-domain" \
  -H "Content-Type: application/json" \
  -d '{"domain": "parkingexeterairport.co.uk", "tenantSlug": "flyparksexeter"}'
```

## What the Logs Should Show

After fixing, when you visit `https://parkingexeterairport.co.uk`, you should see:

```
[MW] Processing request: { host: 'parkingexeterairport.co.uk', ... }
[MW] Custom domain rewrite: { from: 'https://parkingexeterairport.co.uk/', to: 'https://your-app.vercel.app/site/parkingexeterairport.co.uk/' }
🌐 [SITE] Resolving domain: parkingexeterairport.co.uk
🔍 [SITE] Checking tenant_domains table...
✅ [SITE] Found tenant via tenant_domains: { id: '...', slug: 'flyparksexeter', name: '...' }
✅ [SITE] Redirecting to: /sites/flyparksexeter
```

The issue is almost certainly that the domain `parkingexeterairport.co.uk` is not in your `tenant_domains` table. Once you add it, the domain will work perfectly!
