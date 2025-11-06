# Database Schema for Parking Channel

Based on the codebase analysis, here's the database schema for your Supabase setup:

## Core Tables

### 1. `tenants` - Main tenant/business table
```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  timezone TEXT DEFAULT 'Europe/London',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 2. `user_tenants` - User-tenant relationships
```sql
CREATE TABLE user_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'staff', -- 'owner', 'admin', 'staff'
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 3. `tenant_pricing` - Basic pricing configuration
```sql
CREATE TABLE tenant_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  daily_rate DECIMAL(10,2) DEFAULT 7.0,
  minute_rate DECIMAL(10,4) DEFAULT 0.0049, -- daily_rate / (24 * 60) for per-minute billing
  billing_type TEXT DEFAULT 'day', -- 'day' or 'minute'
  currency TEXT DEFAULT 'GBP',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id)
);
```

### 4. `tenant_stripe` - Stripe Connect integration
```sql
CREATE TABLE tenant_stripe (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  stripe_account_id TEXT,
  connected BOOLEAN DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Optional Advanced Tables

### 5. `price_tiers` - Advanced pricing tiers (optional)
```sql
CREATE TABLE price_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT DEFAULT 'flat', -- 'flat', 'percentage'
  value DECIMAL(10,2) NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  sort_order INTEGER DEFAULT 10,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 6. `pricing_rules` - Advanced pricing rules (optional)
```sql
CREATE TABLE pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  rate_plan_id UUID,
  date_range TEXT, -- PostgreSQL daterange
  date_range_start DATE,
  date_range_end DATE,
  season_id UUID,
  tier_id UUID REFERENCES price_tiers(id),
  weekdays INTEGER[], -- [1,2,3,4,5] for weekdays
  channel TEXT,
  min_stay INTEGER,
  max_stay INTEGER,
  priority INTEGER DEFAULT 0,
  note TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 7. `booking_rules` - Booking restrictions and surcharges
```sql
CREATE TABLE booking_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'blackout', 'surcharge'
  rule_kind TEXT NOT NULL, -- 'blackout', 'surcharge'
  applies_to_days INTEGER[], -- [1,2,3,4,5] for weekdays
  date_range_start DATE,
  date_range_end DATE,
  specific_date DATE,
  surcharge_amount DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 8. `bookings` - Main booking records
```sql
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  customer_name TEXT,
  customer_email TEXT,
  reference TEXT,
  start_at TIMESTAMP WITH TIME ZONE NOT NULL, -- Stored in UTC
  end_at TIMESTAMP WITH TIME ZONE NOT NULL,   -- Stored in UTC
  start_at_local TIMESTAMP GENERATED ALWAYS AS (
    (start_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/London'
  ) STORED, -- Generated column for local time filtering
  end_at_local TIMESTAMP GENERATED ALWAYS AS (
    (end_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/London'
  ) STORED, -- Generated column for local time filtering
  status TEXT DEFAULT 'confirmed', -- 'confirmed', 'cancelled', 'completed'
  money_received BOOLEAN DEFAULT false,
  stripe_payment_intent_id TEXT,
  payment_status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for local time queries
CREATE INDEX idx_bookings_start_at_local ON bookings(start_at_local);
CREATE INDEX idx_bookings_end_at_local ON bookings(end_at_local);
```

**Date/Time Handling:**
- All dates are stored in UTC (`TIMESTAMP WITH TIME ZONE`)
- Incoming dates are parsed as `Europe/London` timezone, then converted to UTC
- Generated columns `start_at_local` and `end_at_local` provide easy filtering by local time
- Use `normalise_booking_times()` RPC function to parse dates on insert

### 9. `booking_extensions` - Booking extension payments
```sql
CREATE TABLE booking_extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  prev_end_at TIMESTAMP WITH TIME ZONE NOT NULL,
  new_end_at TIMESTAMP WITH TIME ZONE NOT NULL,
  quote_amount_cents INTEGER NOT NULL,
  charged_amount_cents INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'GBP',
  note TEXT,
  stripe_payment_intent_id TEXT,
  stripe_payment_status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Row Level Security (RLS) Policies

### Basic RLS for tenant isolation:
```sql
-- Enable RLS on all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_stripe ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_extensions ENABLE ROW LEVEL SECURITY;

-- User-tenant access policy
CREATE POLICY "Users can access their tenants" ON user_tenants
  FOR ALL USING (auth.uid() = user_id);

-- Tenant data access policy
CREATE POLICY "Users can access tenant data" ON tenants
  FOR ALL USING (
    id IN (
      SELECT tenant_id FROM user_tenants 
      WHERE user_id = auth.uid()
    )
  );

-- Tenant-specific data policies
CREATE POLICY "Users can access tenant pricing" ON tenant_pricing
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenants 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can access tenant stripe" ON tenant_stripe
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenants 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can access bookings" ON bookings
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenants 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can access booking extensions" ON booking_extensions
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenants 
      WHERE user_id = auth.uid()
    )
  );
```

## Current System Behavior

Based on the code analysis:

1. **Basic Setup**: Uses `tenant_pricing` table for simple daily rates
2. **Advanced Setup**: Uses `price_tiers` and `pricing_rules` tables for complex pricing
3. **Fallback Logic**: If `price_tiers` doesn't exist, falls back to `tenant_pricing`
4. **Default Tier**: The "default" tier is virtual - generated from `tenant_pricing` data
5. **Stripe Integration**: Uses `tenant_stripe` for connected account management

## Pricing Logic Flow

1. **Simple Pricing**: `tenant_pricing.daily_rate * days`
2. **Advanced Pricing**: 
   - Check `price_tiers` for applicable tiers
   - Apply `pricing_rules` for date ranges, seasons, etc.
   - Calculate final amount with surcharges/blackouts

## Database Functions

### Date/Time Parsing Functions

**`parse_datetime_to_utc(p_text text, p_tz text DEFAULT 'Europe/London')`**
- Parses various date formats (ISO8601, DD/MM/YYYY, Excel serials) and converts to UTC
- Handles timezone conversion automatically (Europe/London handles GMT/BST)
- Returns `timestamptz` in UTC

**`normalise_booking_times(p_start text, p_end text, p_tz text DEFAULT 'Europe/London')`**
- RPC function to parse both start and end times in one call
- Returns table with `start_utc` and `end_utc` columns
- Use this function in import/insert operations

**Usage:**
```sql
SELECT * FROM normalise_booking_times('12/10/2025 10:00', '15/10/2025 14:30', 'Europe/London');
-- Returns: start_utc, end_utc (both in UTC)
```

## API Endpoints

- `GET /api/pricing/tiers` - List pricing tiers
- `POST /api/pricing/tiers` - Create pricing tier
- `PUT /api/pricing/tiers/[id]` - Update pricing tier
- `DELETE /api/pricing/tiers/[id]` - Delete pricing tier
- `GET /api/pricing/rules` - List pricing rules
- `POST /api/pricing/rules` - Create pricing rule

The system is designed to work with both simple and complex pricing setups, automatically detecting which tables exist and using the appropriate logic.

## Date/Time Best Practices

1. **Storage**: Always store dates in UTC (`TIMESTAMP WITH TIME ZONE`)
2. **Ingest**: Parse incoming dates as `Europe/London`, then convert to UTC
3. **Display**: Use generated `*_local` columns or `AT TIME ZONE 'Europe/London'` for display
4. **Filtering**: Use `start_at_local` and `end_at_local` for date-based filters
5. **Operations**: Use UTC for operational comparisons (e.g., `end_at < NOW()`)



