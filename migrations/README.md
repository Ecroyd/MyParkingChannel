# Database Migrations

## Date/Time Handling Migration

This migration implements robust date/time parsing and UTC storage.

### Files

1. **001_datetime_parsing.sql** - Creates parsing functions and generated columns
2. **002_fix_historic_datetimes.sql** - Fix script for historic rows (review before running)

### How to Apply

1. Run `001_datetime_parsing.sql` in your Supabase SQL editor or via migration tool
2. Review the preview queries in `002_fix_historic_datetimes.sql` to identify problematic rows
3. If needed, run the fix queries in `002_fix_historic_datetimes.sql` with appropriate WHERE clauses

### Key Features

- **parse_datetime_to_utc()**: Parses various date formats (ISO, DD/MM/YYYY, Excel serials) and converts to UTC
- **normalise_booking_times()**: RPC function to parse both start and end times in one call
- **Generated columns**: `start_at_local` and `end_at_local` for easy filtering by local time
- **Automatic timezone handling**: Europe/London handles GMT/BST automatically

### Usage in Code

```typescript
// Parse dates via RPC (recommended)
const { data: parsed } = await supabase
  .rpc('normalise_booking_times', {
    p_start: '12/10/2025 10:00',
    p_end: '15/10/2025 14:30',
    p_tz: 'Europe/London'
  });

const start_utc = parsed[0].start_utc;
const end_utc = parsed[0].end_utc;
```

### Query Patterns

```sql
-- Filter by local date (today's arrivals)
SELECT * FROM bookings
WHERE start_at_local >= CURRENT_DATE
  AND start_at_local < CURRENT_DATE + INTERVAL '1 day';

-- Compare UTC times (for operational triggers)
SELECT * FROM bookings
WHERE end_at < NOW(); -- Uses UTC
```

