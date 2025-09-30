-- Check existing analytics functions in Supabase
-- Run this to see what functions already exist

SELECT 
    routine_name,
    routine_type,
    data_type as return_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
    AND routine_name LIKE '%analytics%'
ORDER BY routine_name;
