/**
 * Convert booking_import_staging → public.bookings with tenant_id + reference upsert.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveBookingTimesToUtc,
  sanitizeSupplierDateTimeInput,
} from '@/lib/datetime/parse';
import {
  mapSupplierStatusToBookingStatus,
  normalizeSupplierStatus,
} from "@/lib/ingest/importStatusMapping";
import { normalizeBookingSourceForDb } from "@/lib/bookings/normalizeBookingSource";
import { resolveCustomerName } from "@/lib/bookings/normalizeCustomerName";
import { formatPostgresError } from "@/lib/ingest/logBookingPromotionError";
import { resolveImportPlatform } from "@/lib/ingest/importPlatform";
import { toBookingInsertPayload } from "@/lib/ingest/safeBookingUpsertPayload";

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
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  vehicle_colour?: string | null;
  flight_number?: string | null;
  source?: string | null;
  source_filename?: string | null;
  phone?: string | null;
  return_flight_no?: string | null;
  price?: number | null;
  total_price?: number | null;
  money_received?: number | null;
  notes?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  dedupe_key?: string | null;
  raw_json?: {
    channel?: string;
    kind?: string;
    external_status?: string | null;
    [key: string]: unknown;
  } | null;
};

function isPlaceholderImportEmail(email: string): boolean {
  return /@imports\.local$/i.test(email) || /@myparkingchannel\.app$/i.test(email);
}

function extractEmailFromStagingRawJson(
  rawJson: StagingRow["raw_json"]
): string | null {
  if (!rawJson || typeof rawJson !== "object") return null;
  const raw = rawJson as Record<string, unknown>;
  const extracted = raw.extracted;
  if (extracted && typeof extracted === "object") {
    const email = (extracted as { email?: string }).email;
    if (email && String(email).includes("@")) return String(email).trim();
  }
  const fields = raw.fields;
  if (fields && typeof fields === "object") {
    const email = (fields as { Email?: string }).Email;
    if (email && String(email).includes("@")) return String(email).trim();
  }
  return null;
}

function resolveCustomerEmail(row: StagingRow, reference: string): string {
  const fromRow = row.customer_email;
  if (fromRow && String(fromRow).trim().includes("@") && !isPlaceholderImportEmail(String(fromRow))) {
    return String(fromRow).trim();
  }
  const fromRaw = extractEmailFromStagingRawJson(row.raw_json);
  if (fromRaw && !isPlaceholderImportEmail(fromRaw)) {
    return fromRaw;
  }
  return `import+${reference.toLowerCase()}@imports.local`;
}

function cleanPlate(reg: string | null | undefined): string | null {
  if (!reg) return null;
  const s = String(reg).trim().toUpperCase().replace(/\s+/g, "");
  if (!s || s === "-") return null;
  return s;
}

export function resolveReference(row: StagingRow): string | null {
  const ref = row.reference ?? row.external_reference;
  if (!ref) return null;
  return String(ref).trim().toUpperCase() || null;
}

export function resolveParsedStatus(row: StagingRow): string | null {
  const statusField = row.status != null ? String(row.status).trim() : "";
  const externalStatus = row.external_status;

  if (externalStatus != null && String(externalStatus).trim() !== "") {
    return (
      normalizeSupplierStatus(externalStatus) ?? String(externalStatus).trim().toUpperCase()
    );
  }

  if (statusField) {
    const fromStatus = normalizeSupplierStatus(statusField);
    if (fromStatus) return fromStatus;
    if (statusField.toLowerCase() === "cancelled") return "CANX";
  }

  const fromRaw =
    row.raw_json?.external_status != null
      ? String(row.raw_json.external_status)
      : null;
  return normalizeSupplierStatus(fromRaw) ?? (fromRaw ? String(fromRaw) : null);
}

async function normaliseTimes(
  supabase: SupabaseClient,
  startAtRaw: string,
  endAtRaw: string,
  tz: string
): Promise<{ start_at: string; end_at: string } | { error: string }> {
  const startSanitized = sanitizeSupplierDateTimeInput(startAtRaw);
  const endSanitized = sanitizeSupplierDateTimeInput(endAtRaw);

  const clientResolved = resolveBookingTimesToUtc(startSanitized, endSanitized, tz);
  if (clientResolved) {
    return clientResolved;
  }

  const { data: parsed, error: parseErr } = await supabase.rpc("normalise_booking_times", {
    p_start: startSanitized,
    p_end: endSanitized,
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
  const bookingSource = normalizeBookingSourceForDb(
    platform.bookingSource ?? row.source ?? null,
    {
      channel: channel ?? null,
      externalSource: platform.platformId,
      parserKey: platform.parserKey,
    }
  );

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

  const returnFlight =
    row.return_flight_no ?? (row as { return_flight_number?: string }).return_flight_number ?? null;

  const customerEmail = resolveCustomerEmail(row, reference);
  const customerResolved = resolveCustomerName({
    customerName: row.customer_name,
    customerLastName: (row as { customer_lastname?: string | null }).customer_lastname,
    customerEmail: isPlaceholderImportEmail(customerEmail) ? null : customerEmail,
  });

  const payload: Record<string, unknown> = {
    tenant_id: row.tenant_id,
    reference,
    customer_name: customerResolved.name,
    customer_email: customerEmail,
    customer_phone: row.phone ?? null,
    plate,
    car_make: row.vehicle_make ?? null,
    car_model: row.vehicle_model ?? null,
    car_color: row.vehicle_colour ?? null,
    start_at: times.start_at,
    end_at: times.end_at,
    status: mappedStatus,
    external_status: parsedStatus,
    money_charged: Number.isFinite(moneyCharged) ? moneyCharged : 0,
    money_received: Number.isFinite(moneyReceived) ? moneyReceived : 0,
    notes: row.notes ?? "",
    source: bookingSource,
    external_source: platform.platformId,
    flight_number: row.flight_number ?? null,
    return_flight_number: returnFlight,
    updated_at: new Date().toISOString(),
    is_incomplete: customerResolved.missingCustomerName,
    missing_fields: customerResolved.missingCustomerName ? ["customer_name"] : [],
    ...(isFlyparksText
      ? {
          external_source: "flyparks_email_text",
          source: "direct",
          external_status: parsedStatus ?? "RESERVED",
          gate_status: "reserved",
          ops_status: "reserved",
          anpr_status: "not_arrived",
        }
      : {}),
    ...(row.raw_json?.extracted &&
    typeof row.raw_json.extracted === "object" &&
    (row.raw_json.extracted as { email?: string }).email
      ? { customer_email: (row.raw_json.extracted as { email?: string }).email }
      : {}),
  };

  if (customerResolved.missingCustomerName) {
    const warning = "Parse warning: customer_name not found in source; using fallback";
    payload.notes = [row.notes, warning].filter(Boolean).join("; ");
  }

  if (mappedStatus === "cancelled") {
    payload.gate_status = "cancelled";
    payload.ops_status = "cancelled";
    payload.external_status = "cancelled";
  }

  return payload;
}

export type UpsertStagingResult = {
  log: ImportRowLog;
  bookingId?: string;
  /** Payload sent (or last attempted) when action is error — for booking_import_errors.row_data */
  attemptedPayload?: Record<string, unknown> | null;
};

function bookingPayloadVariants(
  payload: Record<string, unknown>
): Record<string, unknown>[] {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];

  const push = (p: Record<string, unknown>) => {
    const key = JSON.stringify(p);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(p);
  };

  push(payload);

  if (payload.ops_status === "cancelled") {
    const withoutOpsStatus: Record<string, unknown> = { ...payload };
    delete withoutOpsStatus.ops_status;
    push(withoutOpsStatus);
  }

  const src = String(payload.source ?? "");
  if (src === "holiday_extras") {
    push({ ...payload, source: "holidayextras" });
  } else if (src === "holidayextras") {
    push({ ...payload, source: "holiday_extras" });
  }

  return out;
}

async function updateBookingWithVariants(
  supabase: SupabaseClient,
  tenantId: string,
  reference: string,
  updatePayload: Record<string, unknown>,
  bookingId?: string | null
): Promise<
  | { ok: true; bookingId?: string; payload: Record<string, unknown> }
  | { ok: false; reason: string; payload: Record<string, unknown> }
> {
  const variants = bookingPayloadVariants(updatePayload);
  const errors: string[] = [];

  for (const variant of variants) {
    let query = supabase.from("bookings").update(variant).eq("tenant_id", tenantId);
    query = bookingId
      ? query.eq("id", bookingId)
      : query.eq("reference", reference);

    const { data: updated, error: updateErr } = await query.select("id");

    if (!updateErr) {
      return {
        ok: true,
        bookingId: updated?.[0]?.id,
        payload: variant,
      };
    }
    errors.push(formatPostgresError(updateErr));
  }

  return {
    ok: false,
    reason: errors.join(" → "),
    payload: variants[variants.length - 1] ?? updatePayload,
  };
}

type ExistingBookingMatch =
  | { ok: true; row: { id: string; status?: string | null; source?: string | null } | null }
  | { ok: false; reason: string };

async function findExistingBookingForStaging(
  supabase: SupabaseClient,
  tenantId: string,
  reference: string,
  source: unknown
): Promise<ExistingBookingMatch> {
  const sourceText = source == null ? null : String(source);
  if (sourceText) {
    const { data: sourceRows, error: sourceErr } = await supabase
      .from("bookings")
      .select("id, status, source")
      .eq("tenant_id", tenantId)
      .eq("reference", reference)
      .eq("source", sourceText);

    if (sourceErr) {
      return { ok: false, reason: `select existing by source: ${formatPostgresError(sourceErr)}` };
    }
    if (sourceRows && sourceRows.length === 1) {
      return { ok: true, row: sourceRows[0] };
    }
    if (sourceRows && sourceRows.length > 1) {
      return { ok: false, reason: `multiple existing bookings for tenant/source/reference (${sourceText}/${reference})` };
    }
  }

  const { data: referenceRows, error: referenceErr } = await supabase
    .from("bookings")
    .select("id, status, source")
    .eq("tenant_id", tenantId)
    .eq("reference", reference);

  if (referenceErr) {
    return { ok: false, reason: `select existing by reference: ${formatPostgresError(referenceErr)}` };
  }

  if (!referenceRows || referenceRows.length === 0) return { ok: true, row: null };
  if (referenceRows.length === 1) return { ok: true, row: referenceRows[0] };

  const legacyRows = referenceRows.filter((r) => {
    const s = String((r as { source?: string | null }).source ?? "").toLowerCase();
    return s === "other" || s === "" || s === "direct";
  });
  if (legacyRows.length === 1) return { ok: true, row: legacyRows[0] };

  return { ok: false, reason: `multiple existing bookings for tenant/reference (${reference}) and no unique source match` };
}

async function insertBookingWithVariants(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  reference: string,
  baseLog: ImportRowLog,
  mappedStatus: string
): Promise<UpsertStagingResult> {
  const variants = bookingPayloadVariants(payload);
  const errors: string[] = [];

  for (const variant of variants) {
    const { data: inserted, error: insertErr } = await supabase
      .from("bookings")
      .insert(variant)
      .select("id")
      .single();

    if (!insertErr) {
      return {
        log: {
          ...baseLog,
          reference,
          action: "inserted",
          mapped_status: mappedStatus,
        },
        bookingId: inserted?.id,
        attemptedPayload: variant,
      };
    }
    errors.push(formatPostgresError(insertErr));
  }

  const upsertFallback = await tryPostgrestUpsert(
    supabase,
    variants[0] ?? payload,
    reference,
    baseLog,
    mappedStatus
  );
  if (upsertFallback) return { ...upsertFallback, attemptedPayload: variants[0] ?? payload };

  return {
    log: {
      ...baseLog,
      reference,
      action: "error",
      reason: errors.join(" → "),
    },
    attemptedPayload: variants[variants.length - 1] ?? payload,
  };
}

/**
 * Update existing booking(s) by tenant_id + reference, or insert when none exist.
 * Does not rely on PostgREST upsert unique constraint (works even if only app-level match).
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
      attemptedPayload: null,
    };
  }

  const bookingRowRaw = buildBookingPayloadFromStaging(row, times);
  const safePayload = toBookingInsertPayload(bookingRowRaw);
  if (!safePayload.ok) {
    return {
      log: { ...baseLog, reference, action: "error", reason: safePayload.error },
      attemptedPayload: bookingRowRaw,
    };
  }

  const tenantId = row.tenant_id;
  const payload = safePayload.data;

  const existing = await findExistingBookingForStaging(
    supabase,
    tenantId,
    reference,
    payload.source
  );

  if (!existing.ok) {
    return {
      log: {
        ...baseLog,
        reference,
        action: "error",
        reason: existing.reason,
      },
      attemptedPayload: payload,
    };
  }

  const updatePayload = { ...payload };
  delete updatePayload.tenant_id;
  delete updatePayload.reference;

  if (existing.row) {
    const updateResult = await updateBookingWithVariants(
      supabase,
      tenantId,
      reference,
      updatePayload,
      existing.row.id
    );

    if (!updateResult.ok) {
      return {
        log: {
          ...baseLog,
          reference,
          action: "error",
          reason: `update: ${updateResult.reason}`,
        },
        attemptedPayload: updateResult.payload,
      };
    }

    return {
      log: { ...baseLog, reference, action: "updated", mapped_status: mappedStatus },
      bookingId: updateResult.bookingId ?? existing.row.id,
      attemptedPayload: updateResult.payload,
    };
  }

  return insertBookingWithVariants(
    supabase,
    payload,
    reference,
    baseLog,
    mappedStatus
  );
}

async function tryPostgrestUpsert(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  reference: string,
  baseLog: ImportRowLog,
  mappedStatus: string
): Promise<UpsertStagingResult | null> {
  const { data: upserted, error: upsertErr } = await supabase
    .from("bookings")
    .upsert(payload, {
      onConflict: "tenant_id,reference",
      ignoreDuplicates: false,
    })
    .select("id")
    .single();

  if (upsertErr) return null;

  return {
    log: {
      ...baseLog,
      reference,
      action: "updated",
      mapped_status: mappedStatus,
    },
    bookingId: upserted?.id,
  };
}

/** Staging dedupe key: one row per tenant + reference (import overwrites). */
export function makeStagingDedupeKey(tenantId: string, reference: string): string {
  return `${tenantId}|ref|${String(reference).trim().toUpperCase()}`;
}
