/**
 * Convert booking_import_staging → public.bookings with tenant_id + reference upsert.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mapSupplierStatusToBookingStatus,
  normalizeSupplierStatus,
} from "@/lib/ingest/importStatusMapping";
import { resolveImportPlatform } from "@/lib/ingest/importPlatform";
import { safeBookingUpsertPayload } from "@/lib/ingest/safeBookingUpsertPayload";

export type ImportRowAction = "inserted" | "updated" | "skipped" | "error";

export type ImportRowLog = {
  reference: string;
  action: ImportRowAction;
  parsed_status: string | null;
  mapped_status: string;
  source_filename: string | null;
  reason?: string;
};

export type StagingRow = Record<string, unknown> & {
  tenant_id: string;
  reference?: string | null;
  external_reference?: string | null;
  external_status?: string | null;
  status?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  vehicle_reg?: string | null;
  source?: string | null;
  source_filename?: string | null;
  price?: number | null;
  total_price?: number | null;
  money_received?: number | null;
  raw_json?: {
    channel?: string;
    kind?: string;
    external_status?: string | null;
    [key: string]: unknown;
  } | null;
};

function cleanPlate(reg: string | null | undefined): string | null {
  if (!reg) return null;
  const s = String(reg).trim().toUpperCase();
  if (!s || s === "-") return null;
  return s;
}

function resolveReference(row: StagingRow): string | null {
  const ref = row.reference ?? row.external_reference;
  if (!ref) return null;
  return String(ref).trim().toUpperCase() || null;
}

function resolveParsedStatus(row: StagingRow): string | null {
  const fromStaging = row.external_status ?? row.status;
  const fromRaw =
    row.raw_json?.external_status != null
      ? String(row.raw_json.external_status)
      : null;
  return normalizeSupplierStatus(fromStaging ?? fromRaw) ?? (fromStaging ? String(fromStaging) : null);
}

async function normaliseTimes(
  supabase: SupabaseClient,
  startAtRaw: string,
  endAtRaw: string,
  tz: string
): Promise<{ start_at: string; end_at: string } | { error: string }> {
  const { data: parsed, error: parseErr } = await supabase.rpc("normalise_booking_times", {
    p_start: startAtRaw,
    p_end: endAtRaw,
    p_tz: tz,
  });

  if (parseErr) return { error: parseErr.message };
  if (!parsed?.length) return { error: "normalise_booking_times returned no rows" };

  let startAtParsed = parsed[0].start_utc ?? null;
  let endAtParsed = parsed[0].end_utc ?? null;
  if (!startAtParsed || !endAtParsed) {
    return { error: "normalise_booking_times returned null" };
  }

  const startMs = new Date(startAtParsed).getTime();
  const endMs = new Date(endAtParsed).getTime();
  if (endMs <= startMs) {
    endAtParsed = new Date(startMs + 60 * 60 * 1000).toISOString();
  }

  return { start_at: startAtParsed, end_at: endAtParsed };
}

export function buildBookingPayloadFromStaging(
  row: StagingRow,
  times: { start_at: string; end_at: string }
): Record<string, unknown> {
  const reference = resolveReference(row)!;
  const channel =
    row.raw_json?.channel ??
    (typeof row.raw_json === "object" && row.raw_json
      ? (row.raw_json as { channel?: string }).channel
      : null);
  const platform = resolveImportPlatform({
    channel: channel ?? null,
    stagingSource: row.source ?? null,
  });

  const parsedStatus = resolveParsedStatus(row);
  const mappedStatus = mapSupplierStatusToBookingStatus(parsedStatus);

  const isFlyparksText = row.raw_json?.kind === "flyparks_text_email";
  const plate = cleanPlate(row.vehicle_reg as string | null);

  const moneyCharged =
    row.price != null
      ? Number(row.price)
      : row.total_price != null
        ? Number(row.total_price)
        : 0;
  const moneyReceived =
    row.money_received != null ? Number(row.money_received) : moneyCharged;

  const payload: Record<string, unknown> = {
    tenant_id: row.tenant_id,
    reference,
    customer_name: row.customer_name ?? null,
    customer_email: row.customer_email ?? "",
    customer_phone: row.phone ?? null,
    plate,
    car_make: row.vehicle_make ?? null,
    car_model: row.vehicle_model ?? null,
    car_color: row.vehicle_colour ?? null,
    start_at: times.start_at,
    end_at: times.end_at,
    status: mappedStatus,
    supplier_status: parsedStatus,
    external_status: parsedStatus,
    money_charged: Number.isFinite(moneyCharged) ? moneyCharged : 0,
    money_received: Number.isFinite(moneyReceived) ? moneyReceived : 0,
    notes: row.notes ?? "",
    source: platform.bookingSource,
    external_source: platform.platformId,
    flight_number: row.flight_number ?? null,
    updated_at: new Date().toISOString(),
    is_incomplete: false,
    missing_fields: [],
  };

  if (row.raw_json?.extracted && typeof row.raw_json.extracted === "object") {
    const email = (row.raw_json.extracted as { email?: string }).email;
    if (email) payload.customer_email = email;
  }

  if (isFlyparksText) {
    payload.external_source = "flyparks_email_text";
    payload.source = "direct";
  }

  return payload;
}

export type UpsertStagingResult = {
  log: ImportRowLog;
  bookingId?: string;
};

/**
 * Upsert one staging row into public.bookings (tenant_id + reference).
 */
export async function upsertBookingFromStagingRow(
  supabase: SupabaseClient,
  row: StagingRow,
  opts?: { timezone?: string; sourceFilename?: string | null }
): Promise<UpsertStagingResult> {
  const reference = resolveReference(row);
  const sourceFilename =
    opts?.sourceFilename ?? (row.source_filename as string | null) ?? null;
  const parsedStatus = resolveParsedStatus(row);
  const mappedStatus = mapSupplierStatusToBookingStatus(parsedStatus);

  const baseLog: ImportRowLog = {
    reference: reference ?? "UNKNOWN",
    action: "error",
    parsed_status: parsedStatus,
    mapped_status: mappedStatus,
    source_filename: sourceFilename,
  };

  if (!reference) {
    return {
      log: { ...baseLog, action: "skipped", reason: "missing reference" },
    };
  }

  const startAtRaw = row.start_at;
  const endAtRaw = row.end_at;
  if (!startAtRaw) {
    return {
      log: {
        ...baseLog,
        reference,
        action: "skipped",
        reason: "missing start_at",
      },
    };
  }

  // end_at optional — synthesize from start when missing (Holiday Extras CANX)
  const endAtForNormalize = endAtRaw || startAtRaw;

  let tz = opts?.timezone ?? "Europe/London";
  if (!opts?.timezone) {
    const { data: tenantData } = await supabase
      .from("tenants")
      .select("timezone")
      .eq("id", row.tenant_id)
      .single();
    tz = tenantData?.timezone ?? "Europe/London";
  }

  const times = await normaliseTimes(
    supabase,
    String(startAtRaw),
    String(endAtForNormalize),
    tz
  );
  if ("error" in times) {
    return {
      log: { ...baseLog, reference, action: "error", reason: times.error },
    };
  }

  const { data: existing } = await supabase
    .from("bookings")
    .select("id")
    .eq("tenant_id", row.tenant_id)
    .eq("reference", reference)
    .maybeSingle();

  const bookingRowRaw = buildBookingPayloadFromStaging(row, times);
  const safePayload = safeBookingUpsertPayload(bookingRowRaw);
  if (!safePayload.ok) {
    return {
      log: { ...baseLog, reference, action: "error", reason: safePayload.error },
    };
  }

  const { data: upserted, error: upsertErr } = await supabase
    .from("bookings")
    .upsert(safePayload.data, {
      onConflict: "tenant_id,reference",
      ignoreDuplicates: false,
    })
    .select("id")
    .single();

  if (upsertErr) {
    return {
      log: {
        ...baseLog,
        reference,
        action: "error",
        reason: upsertErr.message,
      },
    };
  }

  const action: ImportRowAction = existing?.id ? "updated" : "inserted";
  return {
    log: { ...baseLog, reference, action, mapped_status: mappedStatus },
    bookingId: upserted?.id,
  };
}

/** Staging dedupe key: one row per tenant + reference (import overwrites). */
export function makeStagingDedupeKey(tenantId: string, reference: string): string {
  return `${tenantId}|ref|${String(reference).trim().toUpperCase()}`;
}
