/**
 * Helper function to get a user-friendly supplier/channel label from booking data.
 * 
 * Priority:
 * 1. external_source (if present and non-empty) - e.g. "CAVU TEST", "Holiday Extras"
 * 2. source enum formatted nicely - e.g. "supplier_api" -> "Supplier API", "manual" -> "Manual"
 * 3. "Unknown supplier" as fallback
 */
export function getSupplierLabel(row: {
  supplier_name?: string | null;
  external_source?: string | null;
  source?: string | null;
}): string {
  // Priority 1: Use supplier_name if provided (from analytics queries)
  if (row.supplier_name && row.supplier_name.trim().length > 0) {
    return row.supplier_name.trim();
  }

  // Priority 2: Use external_source if available
  if (row.external_source && row.external_source.trim().length > 0) {
    return row.external_source.trim();
  }

  // Priority 3: Format the enum source nicely
  if (row.source) {
    switch (row.source) {
      case 'manual':
        return 'Manual';
      case 'supplier_api':
        return 'Supplier API';
      case 'direct':
        return 'Direct';
      case 'agent':
        return 'Agent';
      default:
        // Convert snake_case to Title Case
        return row.source
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
    }
  }

  return 'Unknown supplier';
}

/**
 * Get supplier name for SQL queries - coalesces external_source and source
 * Use this in SQL SELECT statements to create a supplier_name field
 */
export function getSupplierNameSQL(): string {
  return `coalesce(nullif(trim(external_source), ''), source::text) as supplier_name`;
}

