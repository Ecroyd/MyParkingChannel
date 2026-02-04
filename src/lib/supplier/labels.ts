/**
 * Display labels for bookings.source (enum) only.
 * Used at display time for analytics/demand curve. Never store these in the database.
 */
export const SOURCE_LABELS: Record<string, string> = {
  aph: "APH Email Import",
  cavu: "CAVU",
  holidayextras: "Holiday Extras",
  direct: "Direct",
  manual: "Manual",
  other: "Other",
  parkvia: "ParkVia",
  supplier_api: "Supplier API",
};

/**
 * Get display label for a booking source (enum value).
 * For analytics/demand curve: group by source only, then use this for display.
 */
export function getSourceLabel(source: string | null | undefined): string {
  if (source == null || source === "") return SOURCE_LABELS.other ?? "Other";
  const key = source.toLowerCase();
  if (SOURCE_LABELS[key]) return SOURCE_LABELS[key];
  return source
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Helper function to get a user-friendly supplier/channel label from booking data.
 * Use for non-analytics UI (e.g. booking list) where showing external_source is desired.
 *
 * Priority:
 * 1. supplier_name if provided (from analytics queries that already grouped by source)
 * 2. external_source (if present and non-empty) - e.g. "CAVU TEST", "Holiday Extras"
 * 3. source enum via getSourceLabel()
 */
export function getSupplierLabel(row: {
  supplier_name?: string | null;
  external_source?: string | null;
  source?: string | null;
}): string {
  if (row.supplier_name && row.supplier_name.trim().length > 0) {
    return row.supplier_name.trim();
  }
  if (row.external_source && row.external_source.trim().length > 0) {
    return row.external_source.trim();
  }
  return getSourceLabel(row.source);
}

/**
 * Get supplier name for SQL queries - coalesces external_source and source
 * Use this in SQL SELECT statements to create a supplier_name field
 */
export function getSupplierNameSQL(): string {
  return `coalesce(nullif(trim(external_source), ''), source::text) as supplier_name`;
}

