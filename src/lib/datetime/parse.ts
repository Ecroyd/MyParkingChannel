/**
 * Date/time parsing utilities
 * 
 * All date parsing should use the Postgres RPC function `normalise_booking_times`
 * to ensure consistent UTC storage and proper timezone handling.
 */

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Parse booking start and end times using Postgres RPC function
 * This ensures all dates are parsed as Europe/London and converted to UTC
 * 
 * @param startRaw - Raw start date string (can be ISO, DD/MM/YYYY, Excel serial, etc.)
 * @param endRaw - Raw end date string
 * @param timezone - Timezone to parse dates as (default: 'Europe/London')
 * @returns Object with start_utc and end_utc as ISO strings
 */
export async function parseBookingTimes(
  startRaw: string,
  endRaw: string,
  timezone: string = 'Europe/London'
): Promise<{ start_utc: string; end_utc: string } | null> {
  const supabase = createAdminClient();

  const { data: parsed, error: parseErr } = await supabase
    .rpc('normalise_booking_times', {
      p_start: startRaw,
      p_end: endRaw,
      p_tz: timezone
    });

  if (parseErr || !parsed || parsed.length === 0) {
    console.error('Failed to parse booking times:', parseErr);
    return null;
  }

  const { start_utc, end_utc } = parsed[0];

  if (!start_utc || !end_utc) {
    console.error('Parsed dates are null');
    return null;
  }

  return {
    start_utc: start_utc,
    end_utc: end_utc
  };
}

/**
 * Parse a single datetime string to UTC
 * 
 * @param dateRaw - Raw date string
 * @param timezone - Timezone to parse date as (default: 'Europe/London')
 * @returns ISO string in UTC or null
 */
export async function parseDateTimeToUtc(
  dateRaw: string,
  timezone: string = 'Europe/London'
): Promise<string | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .rpc('parse_datetime_to_utc', {
      p_text: dateRaw,
      p_tz: timezone
    });

  if (error || !data) {
    console.error('Failed to parse datetime:', error);
    return null;
  }

  return data;
}

