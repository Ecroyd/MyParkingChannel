-- Migration: Robust datetime parsing and UTC storage
-- Goal: Store UTC in DB, parse incoming dates as Europe/London, convert to UTC

-- 1. Create parse_datetime_to_utc function (if not exists)
CREATE OR REPLACE FUNCTION public.parse_datetime_to_utc(p_text text, p_tz text DEFAULT 'Europe/London')
RETURNS timestamptz
LANGUAGE plpgsql
AS $$
DECLARE
  v text := nullif(btrim(p_text), '');
  v_ts timestamptz;
  v_num numeric;
BEGIN
  IF v IS NULL THEN
    RETURN NULL;
  END IF;

  -- Try ISO first (Postgres handles most ISO8601 strings)
  BEGIN
    v_ts := (v)::timestamptz;
    RETURN v_ts;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Try "DD/MM/YYYY HH24:MI[:SS]" or "DD/MM/YYYY"
  BEGIN
    v_ts := (to_timestamp(v, 'DD/MM/YYYY HH24:MI:SS') AT TIME ZONE p_tz);
    RETURN v_ts AT TIME ZONE 'UTC';
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      v_ts := (to_timestamp(v, 'DD/MM/YYYY HH24:MI') AT TIME ZONE p_tz);
      RETURN v_ts AT TIME ZONE 'UTC';
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        v_ts := (to_timestamp(v, 'DD/MM/YYYY') AT TIME ZONE p_tz);
        RETURN v_ts AT TIME ZONE 'UTC';
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END;
  END;

  -- Try Excel serial (days since 1899-12-30)
  BEGIN
    v_num := v::numeric;
    v_ts := ((timestamp '1899-12-30'
              + make_interval(days => floor(v_num)::int)
              + make_interval(secs => round((v_num - floor(v_num)) * 86400)::int))
             AT TIME ZONE p_tz);
    RETURN v_ts AT TIME ZONE 'UTC';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Try "YYYY-MM-DD HH24:MI[:SS]"
  BEGIN
    v_ts := (to_timestamp(v, 'YYYY-MM-DD HH24:MI:SS') AT TIME ZONE p_tz);
    RETURN v_ts AT TIME ZONE 'UTC';
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      v_ts := (to_timestamp(v, 'YYYY-MM-DD HH24:MI') AT TIME ZONE p_tz);
      RETURN v_ts AT TIME ZONE 'UTC';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;

  RAISE EXCEPTION USING
    MESSAGE = format('Unable to parse datetime: %s', p_text),
    HINT = 'Expected ISO8601, DD/MM/YYYY HH:MM, or Excel serial';
END;
$$;

-- 2. Create normalise_booking_times RPC function
CREATE OR REPLACE FUNCTION public.normalise_booking_times(
  p_start text,
  p_end text,
  p_tz text DEFAULT 'Europe/London'
)
RETURNS TABLE(start_utc timestamptz, end_utc timestamptz)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    public.parse_datetime_to_utc(p_start, p_tz) AS start_utc,
    public.parse_datetime_to_utc(p_end, p_tz) AS end_utc;
END;
$$;

-- 3. Add generated columns for local time (if bookings table exists)
DO $$
BEGIN
  -- Check if bookings table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bookings') THEN
    -- Add start_at_local if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'bookings' 
      AND column_name = 'start_at_local'
    ) THEN
      ALTER TABLE public.bookings
      ADD COLUMN start_at_local timestamp GENERATED ALWAYS AS (
        (start_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/London'
      ) STORED;
    END IF;

    -- Add end_at_local if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'bookings' 
      AND column_name = 'end_at_local'
    ) THEN
      ALTER TABLE public.bookings
      ADD COLUMN end_at_local timestamp GENERATED ALWAYS AS (
        (end_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/London'
      ) STORED;
    END IF;

    -- Create indexes for local time queries
    CREATE INDEX IF NOT EXISTS idx_bookings_start_at_local ON public.bookings(start_at_local);
    CREATE INDEX IF NOT EXISTS idx_bookings_end_at_local ON public.bookings(end_at_local);
  END IF;
END $$;

