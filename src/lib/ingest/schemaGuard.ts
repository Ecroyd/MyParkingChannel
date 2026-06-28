import type { SupabaseClient } from "@supabase/supabase-js";

export type SchemaColumnCheck = {
  table: string;
  column: string;
  ok: boolean;
  error?: string;
};

export type IngestSchemaGuardResult = {
  ok: boolean;
  checkedAt: string;
  columns: SchemaColumnCheck[];
  missing: string[];
};

const REQUIRED_COLUMNS: { table: string; column: string }[] = [
  { table: "bookings", column: "external_status" },
  { table: "bookings", column: "reference" },
  { table: "bookings", column: "status" },
  { table: "bookings", column: "gate_status" },
  { table: "bookings", column: "ops_status" },
  { table: "booking_import_staging", column: "external_status" },
  { table: "booking_import_staging", column: "source_email_id" },
  { table: "ingest_emails", column: "raw_rfc822_base64" },
  { table: "ingest_email_parses", column: "ingest_email_id" },
];

/**
 * Probe PostgREST schema cache by selecting each required column (limit 0).
 */
export async function checkIngestSchemaColumns(
  supabase: SupabaseClient
): Promise<IngestSchemaGuardResult> {
  const columns: SchemaColumnCheck[] = [];

  for (const { table, column } of REQUIRED_COLUMNS) {
    const { error } = await supabase.from(table).select(column).limit(0);
    if (error) {
      const msg = error.message ?? String(error);
      const missing =
        msg.includes("Could not find") ||
        msg.includes("column") ||
        msg.includes("schema cache");
      columns.push({
        table,
        column,
        ok: false,
        error: msg,
      });
      if (missing) {
        // keep as failed
      }
    } else {
      columns.push({ table, column, ok: true });
    }
  }

  const missing = columns
    .filter((c) => !c.ok)
    .map((c) => `${c.table}.${c.column}`);

  return {
    ok: missing.length === 0,
    checkedAt: new Date().toISOString(),
    columns,
    missing,
  };
}
