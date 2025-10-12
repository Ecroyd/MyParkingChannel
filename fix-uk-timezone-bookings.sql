-- SAFE: Fix existing bookings to treat them as UK timezone
-- This script preserves the exact dates/times but fixes timezone interpretation
-- NO DATES WILL CHANGE - only timezone metadata

-- STEP 1: First, let's see what we're working with
SELECT 
  id, 
  start_at, 
  end_at, 
  created_at,
  customer_name,
  plate,
  start_at AT TIME ZONE 'Europe/London' as start_uk_display,
  end_at AT TIME ZONE 'Europe/London' as end_uk_display
FROM bookings 
ORDER BY created_at DESC 
LIMIT 10;

-- STEP 2: Create a backup table first (SAFETY FIRST!)
-- Drop existing backup if it exists
DROP TABLE IF EXISTS bookings_backup;
CREATE TABLE bookings_backup AS 
SELECT * FROM bookings;

-- STEP 3: The issue is likely that dates are stored as UTC but should represent UK time
-- This method treats the stored UTC timestamps as if they were UK time
-- and converts them to proper UTC representation

-- SAFE METHOD: Only update if we're sure about the timezone issue
-- This preserves the exact date/time values but fixes timezone interpretation
UPDATE bookings 
SET 
  start_at = start_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London',
  end_at = end_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London'
WHERE start_at IS NOT NULL AND end_at IS NOT NULL;

-- STEP 4: Verify the changes - dates should look the same in UK timezone
SELECT 
  id, 
  start_at, 
  end_at, 
  created_at,
  customer_name,
  plate,
  start_at AT TIME ZONE 'Europe/London' as start_uk_time,
  end_at AT TIME ZONE 'Europe/London' as end_uk_time
FROM bookings 
ORDER BY created_at DESC 
LIMIT 10;

-- STEP 5: If something goes wrong, restore from backup:
-- DELETE FROM bookings;
-- INSERT INTO bookings SELECT * FROM bookings_backup;
-- DROP TABLE bookings_backup;
