-- Check existing analytics functions in Supabase
-- Run this first to see what's already there

-- Check if analytics functions already exist
SELECT 
    routine_name,
    routine_type,
    data_type as return_type,
    routine_definition
FROM information_schema.routines 
WHERE routine_schema = 'public' 
    AND routine_name LIKE '%analytics%'
ORDER BY routine_name;

-- Check if there are any existing functions with similar names
SELECT 
    routine_name,
    routine_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
    AND (routine_name LIKE '%revenue%' 
         OR routine_name LIKE '%summary%' 
         OR routine_name LIKE '%daily%')
ORDER BY routine_name;

-- Check what tables exist that might be related to analytics
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
    AND (table_name LIKE '%booking%' 
         OR table_name LIKE '%analytics%'
         OR table_name LIKE '%revenue%')
ORDER BY table_name;
