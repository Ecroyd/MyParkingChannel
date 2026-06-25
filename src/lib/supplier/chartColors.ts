/** Stable chart colours per bookings.source key (normalized via keyFromSource). */
export const SOURCE_CHART_COLORS: Record<string, string> = {
  direct: "#2563eb",
  aph: "#ec4899",
  cavu: "#8b5cf6",
  holiday_extras: "#f59e0b",
  holidayextras: "#f59e0b",
  parkvia: "#10b981",
  manual: "#06b6d4",
  supplier_api: "#ef4444",
  other: "#6b7280",
};

const FALLBACK_PALETTE = [
  "#14b8a6", "#eab308", "#f97316", "#84cc16", "#22c55e",
];

/** Deterministic colour for a source key; explicit map first, then hash fallback. */
export function colorForSourceKey(key: string): string {
  if (SOURCE_CHART_COLORS[key]) return SOURCE_CHART_COLORS[key];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return FALLBACK_PALETTE[h % FALLBACK_PALETTE.length];
}
