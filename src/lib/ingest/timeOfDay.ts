/**
 * Extract a time of day from supplier email text and return 24h "HH:mm".
 * Handles "13:45", "09:15", "9:15 PM", "2:30pm", "12:05 a.m." (12 AM = 00, 12 PM = 12).
 * Returns null when no valid time is present.
 */
export function extractTimeOfDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = String(value).match(/(?:^|[^\d])(\d{1,2}):(\d{2})(?!\d)(?:\s*([ap])\.?\s*m\b\.?)?/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const meridiem = m[3]?.toLowerCase();
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "a") hour = hour === 12 ? 0 : hour;
    else hour = hour === 12 ? 12 : hour + 12;
  } else if (hour > 23) {
    return null;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
