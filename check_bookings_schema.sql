-- SQL Query to check if the bookings table schema matches the code expectations
-- Run this in your Supabase SQL Editor

-- Check the bookings table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length
FROM 
    information_schema.columns
WHERE 
    table_schema = 'public' 
    AND table_name = 'bookings'
ORDER BY 
    ordinal_position;

-- Check specifically for the fields used in gate status updates
SELECT 
    column_name,
    data_type,
    is_nullable
FROM 
    information_schema.columns
WHERE 
    table_schema = 'public' 
    AND table_name = 'bookings'
    AND column_name IN ('checked_in_at', 'checked_out_at', 'status', 'id', 'tenant_id')
ORDER BY 
    column_name;

-- Check if checked_in_at and checked_out_at are timestamp fields (should be timestamptz)
SELECT 
    column_name,
    data_type,
    udt_name,
    is_nullable
FROM 
    information_schema.columns
WHERE 
    table_schema = 'public' 
    AND table_name = 'bookings'
    AND column_name IN ('checked_in_at', 'checked_out_at');

-- Check for any constraints or triggers that might affect updates
SELECT 
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(oid) AS constraint_definition
FROM 
    pg_constraint
WHERE 
    conrelid = 'public.bookings'::regclass
    AND (conname LIKE '%checked%' OR contype = 't'); -- triggers or check constraints

-- Check for any triggers on the bookings table
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing
FROM 
    information_schema.triggers
WHERE 
    event_object_schema = 'public'
    AND event_object_table = 'bookings';

-- Check if there are any triggers that update checked_in_at or checked_out_at based on status
SELECT 
    t.tgname AS trigger_name,
    CASE 
        WHEN t.tgtype::integer & 2 = 2 THEN 'BEFORE'
        WHEN t.tgtype::integer & 64 = 64 THEN 'INSTEAD OF'
        ELSE 'AFTER'
    END AS trigger_timing,
    CASE 
        WHEN t.tgtype::integer & 4 = 4 THEN 'INSERT'
        WHEN t.tgtype::integer & 8 = 8 THEN 'DELETE'
        WHEN t.tgtype::integer & 16 = 16 THEN 'UPDATE'
        ELSE 'UNKNOWN'
    END AS trigger_event,
    pg_get_triggerdef(t.oid) AS trigger_definition
FROM 
    pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE 
    n.nspname = 'public'
    AND c.relname = 'bookings'
    AND t.tgname NOT LIKE 'RI_%'; -- Exclude foreign key triggers

-- Sample query to see actual data structure
SELECT 
    id,
    tenant_id,
    status,
    checked_in_at,
    checked_out_at,
    start_at,
    end_at,
    created_at,
    updated_at
FROM 
    bookings
LIMIT 5;

-- WHERE THE GATE STATUS COMES FROM:
-- The gate status dropdown reads from the 'bookings' table, specifically:
-- - Column: 'checked_in_at' (timestamptz, nullable)
-- - Column: 'checked_out_at' (timestamptz, nullable)
-- 
-- The status is CALCULATED (not read from the 'status' column) using this logic:
-- - If checked_out_at IS NOT NULL → gate status = 'departed'
-- - Else if checked_in_at IS NOT NULL → gate status = 'arrived'  
-- - Else → gate status = 'reserved'
--
-- The 'status' column in the bookings table is separate and can be:
-- 'reserved', 'checked_in', 'checked_out', 'cancelled'
--
-- When you manually change the gate status dropdown:
-- 1. It updates checked_in_at and checked_out_at timestamps
-- 2. It also updates the 'status' column for consistency
-- 3. The display is recalculated from the timestamps

-- Check a specific booking to see the relationship
SELECT 
    id,
    reference,
    status AS booking_status_column,
    checked_in_at,
    checked_out_at,
    CASE 
        WHEN checked_out_at IS NOT NULL THEN 'departed'
        WHEN checked_in_at IS NOT NULL THEN 'arrived'
        ELSE 'reserved'
    END AS calculated_gate_status,
    start_at,
    end_at
FROM 
    bookings
WHERE 
    status = 'reserved'  -- or 'checked_in' or 'checked_out'
ORDER BY 
    created_at DESC
LIMIT 10;

