# Booking Rules System

A comprehensive per-tenant booking rules system that allows parking businesses to define blackout periods and surcharges for their bookings.

## 🚀 Features

- **Blackout Rules**: Block bookings on specific dates, days of week, or month ranges
- **Surcharge Rules**: Add additional fees to bookings based on various criteria
- **Flexible Conditions**: Combine day-of-week, month ranges, and specific dates
- **Per-Tenant**: Each parking business can define their own rules
- **Real-time Evaluation**: Rules are checked during booking creation
- **Admin Interface**: Easy-to-use UI for managing rules

## 📋 Database Schema

The system uses a single `booking_rules` table with the following structure:

```sql
create table if not exists public.booking_rules (
  id uuid primary key default extensions.uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null check (type in ('arrival', 'return', 'both')),
  rule_kind text not null check (rule_kind in ('blackout', 'surcharge')),

  -- recurrence
  applies_to_days int[] null, -- e.g. {6,0} for Saturday+Sunday
  month_range int[] null,     -- e.g. {4,10} = April–October (inclusive)
  
  -- one-off date override
  specific_date date null,

  -- surcharge settings
  surcharge_amount numeric(12,2) null,

  notes text,
  created_at timestamptz default now()
);
```

## 🛠️ Setup Instructions

### 1. Database Migration

Run the migration to create the booking rules table:

```bash
# Copy the contents of supabase-migrations/create-booking-rules-table.sql
# and run it in your Supabase SQL editor
```

### 2. API Endpoints

The system provides the following API endpoints:

- `GET /api/booking-rules` - List all rules for the tenant
- `POST /api/booking-rules` - Create a new rule
- `GET /api/booking-rules/[id]` - Get a specific rule
- `PUT /api/booking-rules/[id]` - Update a rule
- `DELETE /api/booking-rules/[id]` - Delete a rule
- `POST /api/booking-rules/evaluate` - Evaluate rules against specific dates

### 3. Admin Interface

Access the booking rules management interface at:
```
/admin/booking-rules
```

## 📝 Rule Examples

### Weekend Returns Closed Apr–Oct

```json
{
  "type": "return",
  "rule_kind": "blackout",
  "applies_to_days": [6, 0],
  "month_range": [4, 10],
  "notes": "No Sat/Sun returns Apr–Oct"
}
```

### Closed on Christmas Day

```json
{
  "type": "both",
  "rule_kind": "blackout",
  "specific_date": "2025-12-25",
  "notes": "Christmas Day closed"
}
```

### Surcharge for Friday Arrivals in August

```json
{
  "type": "arrival",
  "rule_kind": "surcharge",
  "applies_to_days": [5],
  "month_range": [8, 8],
  "surcharge_amount": 15,
  "notes": "Peak Friday arrivals in August"
}
```

## 🔧 Rule Types

### Type (Applies To)
- `arrival` - Only affects arrival dates
- `return` - Only affects return dates  
- `both` - Affects both arrival and return dates

### Rule Kind
- `blackout` - Blocks bookings completely
- `surcharge` - Adds additional fees to bookings

### Conditions
- **Days of Week**: Array of integers (0=Sunday, 6=Saturday)
- **Month Range**: Array of two integers [start_month, end_month] (1-12)
- **Specific Date**: Single date override (YYYY-MM-DD format)

## 🧮 Rule Evaluation Logic

When a booking is created, the system:

1. **Fetches all rules** for the tenant
2. **Evaluates each rule** against the booking dates
3. **Checks conditions** in this order:
   - Specific date override
   - Day of week + month range
   - Month range only
4. **Applies results**:
   - If any blackout rule matches → reject booking
   - If surcharge rules match → add surcharge amounts to total

## 🎯 Integration Points

### Booking Creation APIs

The rule evaluation is integrated into:
- `/api/bookings/create` - Admin booking creation
- `/api/public/bookings` - Public booking creation

### Response Format

When rules are applied, the API returns:

```json
{
  "ok": true,
  "booking": { "id": "...", "reference": "..." },
  "surchargeApplied": true,
  "surchargeAmount": 15,
  "totalAmount": 35
}
```

When bookings are blocked:

```json
{
  "error": "Booking not available",
  "details": "This booking is blocked on Saturday, Sunday in April to October.",
  "blocked": true
}
```

## 🔒 Security Features

- **Row Level Security**: Users can only access rules for their tenant
- **Tenant Isolation**: All operations are scoped to the user's tenant
- **Input Validation**: All rule data is validated using Zod schemas
- **Type Safety**: Full TypeScript support throughout

## 🧪 Testing

The system includes comprehensive tests in:
```
src/lib/booking-rules/__tests__/evaluation.test.ts
```

Run tests to verify rule evaluation logic works correctly.

## 📱 UI Components

### BookingRulesPageClient
Main page component for listing and managing rules.

### BookingRuleDialog  
Modal dialog for creating and editing rules with:
- Rule type selection (arrival/return/both)
- Rule kind selection (blackout/surcharge)
- Day of week checkboxes
- Month range selectors
- Specific date picker
- Surcharge amount input
- Notes field

## 🚀 Usage

1. **Access Admin Panel**: Go to `/admin/booking-rules`
2. **Create Rules**: Click "Add Rule" to create new rules
3. **Configure Conditions**: Set up the conditions for your rules
4. **Test Bookings**: Try creating bookings to see rules in action
5. **Monitor Results**: Check booking responses for surcharges and blocks

## 🔄 Rule Priority

- **Blackout rules take precedence** - if any blackout rule matches, the booking is blocked
- **Surcharge rules are additive** - multiple surcharge rules can apply to the same booking
- **Specific dates override** recurring rules for that exact date

## 📊 Performance Considerations

- **Indexed Queries**: Database indexes on tenant_id, specific_date, type, and rule_kind
- **Efficient Evaluation**: Rules are evaluated in memory after fetching from database
- **Caching**: Consider caching rules for high-traffic scenarios

## 🛡️ Error Handling

- **Validation Errors**: Clear error messages for invalid rule configurations
- **Database Errors**: Graceful handling of database connection issues
- **Rule Conflicts**: System prevents conflicting rule configurations

## 🔮 Future Enhancements

Potential improvements:
- **Time-based rules**: Rules that apply only during certain hours
- **Capacity-based rules**: Rules that activate when parking is nearly full
- **Customer-specific rules**: Rules that apply only to certain customer types
- **Rule templates**: Pre-built rule templates for common scenarios
- **Rule analytics**: Reporting on which rules are most frequently triggered
