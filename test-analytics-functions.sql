-- Test the analytics functions directly
-- Run this to see if the functions work and what data they return

-- Test the analytics functions with real data
-- Using the first tenant ID from your results

-- Test analytics_summary function
SELECT * FROM analytics_summary(
  'ff6b276d-45c8-48b7-87a9-5fb91528c68a'::UUID,
  '2025-01-01'::DATE,
  '2025-01-31'::DATE
);

-- Test analytics_revenue_by_channel function
SELECT * FROM analytics_revenue_by_channel(
  'ff6b276d-45c8-48b7-87a9-5fb91528c68a'::UUID,
  '2025-01-01'::DATE,
  '2025-01-31'::DATE
);

-- Test analytics_daily_revenue function
SELECT * FROM analytics_daily_revenue(
  'ff6b276d-45c8-48b7-87a9-5fb91528c68a'::UUID,
  '2025-01-01'::DATE,
  '2025-01-31'::DATE
);
