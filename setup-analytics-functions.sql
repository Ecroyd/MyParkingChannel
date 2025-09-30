-- Analytics Functions for Parking Channel
-- Run this in your Supabase SQL Editor to enable analytics functionality

-- 1. Analytics Summary Function
CREATE OR REPLACE FUNCTION analytics_summary(
  p_tenant_id UUID,
  p_start DATE,
  p_end DATE
)
RETURNS TABLE (
  total_bookings BIGINT,
  total_revenue NUMERIC,
  avg_daily_revenue NUMERIC,
  peak_occupancy_rate NUMERIC,
  total_extensions BIGINT,
  extension_revenue NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_bookings,
    COALESCE(SUM(b.money_received), 0) as total_revenue,
    COALESCE(AVG(daily_rev.daily_revenue), 0) as avg_daily_revenue,
    COALESCE(MAX(daily_occ.occupancy_rate), 0) as peak_occupancy_rate,
    COUNT(CASE WHEN b.extension_count > 0 THEN 1 END) as total_extensions,
    COALESCE(SUM(b.extension_revenue), 0) as extension_revenue
  FROM bookings b
  LEFT JOIN (
    SELECT 
      DATE(b2.start_at) as booking_date,
      SUM(b2.money_received) as daily_revenue
    FROM bookings b2
    WHERE b2.tenant_id = p_tenant_id
      AND DATE(b2.start_at) BETWEEN p_start AND p_end
    GROUP BY DATE(b2.start_at)
  ) daily_rev ON DATE(b.start_at) = daily_rev.booking_date
  LEFT JOIN (
    SELECT 
      DATE(b3.start_at) as booking_date,
      (COUNT(*)::NUMERIC / 100.0) as occupancy_rate -- Assuming 100 is max capacity
    FROM bookings b3
    WHERE b3.tenant_id = p_tenant_id
      AND DATE(b3.start_at) BETWEEN p_start AND p_end
    GROUP BY DATE(b3.start_at)
  ) daily_occ ON DATE(b.start_at) = daily_occ.booking_date
  WHERE b.tenant_id = p_tenant_id
    AND DATE(b.start_at) BETWEEN p_start AND p_end;
END;
$$;

-- 2. Revenue by Channel Function
CREATE OR REPLACE FUNCTION analytics_revenue_by_channel(
  p_tenant_id UUID,
  p_start DATE,
  p_end DATE
)
RETURNS TABLE (
  channel TEXT,
  bookings_count BIGINT,
  booking_revenue NUMERIC,
  extension_revenue NUMERIC,
  total_revenue NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(b.source, 'Unknown') as channel,
    COUNT(*) as bookings_count,
    COALESCE(SUM(b.money_received), 0) as booking_revenue,
    COALESCE(SUM(b.extension_revenue), 0) as extension_revenue,
    COALESCE(SUM(b.money_received + COALESCE(b.extension_revenue, 0)), 0) as total_revenue
  FROM bookings b
  WHERE b.tenant_id = p_tenant_id
    AND DATE(b.start_at) BETWEEN p_start AND p_end
  GROUP BY COALESCE(b.source, 'Unknown')
  ORDER BY total_revenue DESC;
END;
$$;

-- 3. Daily Revenue Function
CREATE OR REPLACE FUNCTION analytics_daily_revenue(
  p_tenant_id UUID,
  p_start DATE,
  p_end DATE
)
RETURNS TABLE (
  date DATE,
  bookings_count BIGINT,
  booking_revenue NUMERIC,
  extension_revenue NUMERIC,
  total_revenue NUMERIC,
  occupancy_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    DATE(b.start_at) as date,
    COUNT(*) as bookings_count,
    COALESCE(SUM(b.money_received), 0) as booking_revenue,
    COALESCE(SUM(b.extension_revenue), 0) as extension_revenue,
    COALESCE(SUM(b.money_received + COALESCE(b.extension_revenue, 0)), 0) as total_revenue,
    (COUNT(*)::NUMERIC / 100.0 * 100) as occupancy_rate -- Assuming 100 is max capacity
  FROM bookings b
  WHERE b.tenant_id = p_tenant_id
    AND DATE(b.start_at) BETWEEN p_start AND p_end
  GROUP BY DATE(b.start_at)
  ORDER BY DATE(b.start_at);
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION analytics_summary(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_revenue_by_channel(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_daily_revenue(UUID, DATE, DATE) TO authenticated;
