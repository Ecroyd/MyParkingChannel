# Migration Instructions

## Fix for Site SEO Settings Error

The error you're seeing is because the new latitude/longitude columns don't exist in your database yet.

### Step 1: Run the Migration

1. Go to your **Supabase Dashboard**
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `supabase-migrations/add-coordinates-to-tenant-public-profile.sql`
4. Click **Run** to execute the migration

### Step 2: Verify the Migration

After running the migration, you should see:
- Two new columns added: `latitude` and `longitude`
- An index created for better performance

### Step 3: Test the Settings

1. Go back to your admin panel
2. Navigate to **Site SEO** settings
3. You should now see the latitude/longitude fields
4. Try saving the settings - the error should be gone

### Migration Script Content

```sql
-- Add latitude and longitude columns to tenant_public_profile
-- This allows tenants to set exact coordinates for their map location

-- Add coordinate columns
ALTER TABLE public.tenant_public_profile
ADD COLUMN IF NOT EXISTS latitude decimal(10, 8);
ALTER TABLE public.tenant_public_profile
ADD COLUMN IF NOT EXISTS longitude decimal(11, 8);

-- Add comments for documentation
COMMENT ON COLUMN public.tenant_public_profile.latitude IS 'Latitude coordinate for map center (decimal degrees, -90 to 90)';
COMMENT ON COLUMN public.tenant_public_profile.longitude IS 'Longitude coordinate for map center (decimal degrees, -180 to 180)';

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_tenant_public_profile_coordinates ON public.tenant_public_profile(latitude, longitude);
```

### Troubleshooting

If you still get errors after running the migration:
1. Check the browser console for more detailed error messages
2. Make sure you're logged in as an admin user
3. Verify the `tenant_public_profile` table exists

The migration is safe to run multiple times (it uses `IF NOT EXISTS`).
