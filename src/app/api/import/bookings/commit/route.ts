import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { makeImportDedupeKey } from "@/lib/bookings/dedupe";
import { mapStagingToBookings } from "@/lib/imports/mapToBookings";
import { toBookingInsertPayload } from "@/lib/ingest/safeBookingUpsertPayload";
import { normalizeSupplierStatus } from "@/lib/ingest/importStatusMapping";
import {
  parseSupplierDateTimeToUtc,
  resolveBookingTimesToUtc,
  sanitizeSupplierDateTimeInput,
} from "@/lib/datetime/parse";
import { requireTenantMemberApi } from '@/lib/auth/apiGuards';
import { parseMoney } from "@/lib/parseMoney";
import { mapImportStatus } from "@/lib/imports/normalise";
import { dedupeByReference, type RowIssue } from "@/lib/imports/buildRows";
import {
  buildImportUpdatePayload,
  cancellationOpsFields,
  pickExistingMatch,
  type ExistingBooking,
} from "@/lib/imports/mergeExisting";

// Large imports are sent in chunks by the upload screen; give each chunk room to finish.
export const maxDuration = 300;

/** Max rows accepted per request (the upload screen sends 200 at a time). */
const MAX_ROWS_PER_REQUEST = 1000;

type InRow = {
  source?: string; reference?: string;
  customer_name?: string; customer_lastname?: string; customer_title?: string; customer_firstname?: string;
  /** Naive tenant-local "YYYY-MM-DDTHH:mm:ss" (older clients may send an ISO string ending in Z). */
  start_at?: string; end_at?: string;
  vehicle_reg?: string; vehicle_colour?: string; vehicle_make?: string; vehicle_model?: string;
  flight_number?: string; phone?: string;
  /** Raw status cell from the file; mapped here. */
  status?: string;
  price?: unknown; money_received?: unknown; notes?: string;
  rowNumber?: number;
  _rawRow?: unknown;
};

// Phone finder helpers for Holiday Extras
function normaliseCell(value: any): string {
  if (value == null) return '';
  return String(value).trim().replace(/^"|"$/g, '');
}

function isPhoneLike(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  // Reject obvious non-phones:
  if (/[A-Za-z]/.test(trimmed)) return false; // contains letters
  if (trimmed.includes('/')) return false; // things like "05/30"

  // Allow +, leading zeros, and digits
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length < 8) return false; // too short to be a real phone

  return true;
}

function scorePhoneCandidate(value: string): number {
  const trimmed = value.trim();
  const digitsOnly = trimmed.replace(/[^\d]/g, '');

  let score = 0;

  // Prefer UK-style mobiles/formatting
  if (trimmed.startsWith('+44') || trimmed.startsWith('0044')) {
    score += 10;
  } else if (trimmed.startsWith('44')) {
    score += 8;
  } else if (trimmed.startsWith('07')) {
    score += 7;
  }

  // Longer digit strings are more likely real phone numbers
  if (digitsOnly.length >= 11) score += 3;
  if (digitsOnly.length >= 9) score += 1;

  return score;
}

function pickBestPhoneFromRow(rawRow: any): string | null {
  // rawRow might be an array or an object; support both.
  let cells: string[] = [];

  if (Array.isArray(rawRow)) {
    cells = rawRow.map(normaliseCell);
  } else if (typeof rawRow === 'object' && rawRow !== null) {
    // preserve column order if we have it; Object.values is acceptable for our case
    cells = Object.values(rawRow).map(normaliseCell);
  }

  const candidates: { value: string; score: number; index: number }[] = [];

  cells.forEach((value, index) => {
    if (!isPhoneLike(value)) return;
    const score = scorePhoneCandidate(value);
    if (score > 0) {
      candidates.push({ value, score, index });
    }
  });

  if (candidates.length === 0) {
    return null;
  }

  // Prefer highest score; if tied, prefer the one that appears later in the row
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.index - a.index;
  });

  const best = candidates[0].value.trim();

  // Optional: normalise to a consistent format (e.g. remove spaces)
  return best;
}

async function logImportError(params: {
  tenantId: string;
  importFileId?: string | null;
  importRunId?: string | null;
  rowIndex: number;
  reason: string;
  rowData: any;
}) {
  const { tenantId, importFileId, importRunId, rowIndex, reason, rowData } = params;

  console.error(
    '[IMPORT] Row failed',
    JSON.stringify({ tenantId, rowIndex, reason }, null, 2)
  );

  try {
    const { error } = await supabaseAdmin()
      .from('booking_import_errors')
      .insert({
        tenant_id: tenantId,
        import_file_id: importFileId ?? null,
        import_run_id: importRunId ?? null,
        row_index: rowIndex,
        reason,
        row_data: rowData,
      });

    if (error) {
      console.error(
        '[IMPORT] Failed to log import error to booking_import_errors',
        error
      );
    }
  } catch (err) {
    console.error(
      '[IMPORT] Exception while logging import error to booking_import_errors',
      err
    );
  }
}


type RowError = { rowIndex: number; reference: string; reason: string };

async function resolveTimes(
  startRaw: unknown,
  endRaw: unknown,
  tz: string
): Promise<{ ok: true; start_at: string; end_at: string } | { ok: false; reason: string }> {
  const startText = sanitizeSupplierDateTimeInput(String(startRaw ?? ''));
  const endText = sanitizeSupplierDateTimeInput(String(endRaw ?? ''));
  if (!startText) return { ok: false, reason: 'missing start date/time' };
  if (!endText) return { ok: false, reason: 'missing end date/time' };

  const s = parseSupplierDateTimeToUtc(startText, tz);
  const e = parseSupplierDateTimeToUtc(endText, tz);
  if (s && e && new Date(e).getTime() < new Date(s).getTime()) {
    return { ok: false, reason: `end (${endText}) is before start (${startText})` };
  }

  const resolved = resolveBookingTimesToUtc(startText, endText, tz);
  if (resolved) return { ok: true, ...resolved };

  try {
    const { data: parsed, error: parseErr } = await supabaseAdmin().rpc('normalise_booking_times', {
      p_start: startText,
      p_end: endText,
      p_tz: tz,
    });
    if (!parseErr && parsed && parsed.length > 0 && parsed[0].start_utc && parsed[0].end_utc) {
      return { ok: true, start_at: parsed[0].start_utc, end_at: parsed[0].end_utc };
    }
  } catch {
    // fall through
  }
  return { ok: false, reason: `could not parse start "${startText}" / end "${endText}"` };
}

/** Insert/update, retrying without ops_status (older enum without 'cancelled'), like the email ingest. */
async function writeBooking(
  op: { kind: 'insert' } | { kind: 'update'; id: string; tenantId: string },
  payload: Record<string, unknown>
): Promise<{ error: { message: string; code?: string } | null }> {
  const run = async (p: Record<string, unknown>) => {
    const table = supabaseAdmin().from('bookings');
    const { error } =
      op.kind === 'insert'
        ? await table.insert(p)
        : await table.update(p).eq('id', op.id).eq('tenant_id', op.tenantId);
    return error ? { message: error.message, code: (error as { code?: string }).code } : null;
  };
  let error = await run(payload);
  if (error && error.code !== '23505' && payload.ops_status === 'cancelled') {
    const { ops_status: _drop, ...rest } = payload;
    error = await run(rest);
  }
  return { error };
}

export async function POST(req: Request) {
  const { tenantId, rows, profileName, overwriteDuplicates, sourceMapping } = await req.json();
  const guard = await requireTenantMemberApi(tenantId, ['owner', 'admin', 'ops']);
  if (guard.response) return guard.response;

  if (!tenantId || !Array.isArray(rows)) {
    return NextResponse.json({ error: "tenantId and rows required" }, { status: 400 });
  }
  if (rows.length > MAX_ROWS_PER_REQUEST) {
    return NextResponse.json(
      { error: `Too many rows in one request (${rows.length}); send at most ${MAX_ROWS_PER_REQUEST}.` },
      { status: 413 }
    );
  }
  const overwrite = overwriteDuplicates === true;
  const admin = supabaseAdmin();

  // Chunked uploads: later chunks pass ?runId=… so the whole file is one import run.
  const runIdParam = new URL(req.url).searchParams.get('runId');
  let runId: string;
  let prevCounts = { inserted: 0, skipped: 0, errors: 0 };
  if (runIdParam) {
    const { data: existingRun, error } = await admin
      .from('import_runs')
      .select('id, inserted_count, skipped_duplicates, error_count')
      .eq('id', runIdParam)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error || !existingRun) {
      return NextResponse.json({ error: 'Import run not found for this tenant' }, { status: 400 });
    }
    runId = existingRun.id;
    prevCounts = {
      inserted: existingRun.inserted_count ?? 0,
      skipped: existingRun.skipped_duplicates ?? 0,
      errors: existingRun.error_count ?? 0,
    };
  } else {
    const { data: run, error: runErr } = await admin
      .from("import_runs")
      .insert({ tenant_id: tenantId, profile_name: profileName || null })
      .select("id")
      .single();
    if (runErr || !run) {
      console.error("[IMPORT] Failed to create run:", runErr);
      return NextResponse.json({ error: runErr?.message || "Failed to create run" }, { status: 400 });
    }
    runId = run.id;
  }

  const { data: tenantTzRow } = await admin
    .from("tenants")
    .select("timezone")
    .eq("id", tenantId)
    .maybeSingle();
  const tz: string = tenantTzRow?.timezone || 'Europe/London';
  const profileNameUpper = String(profileName || '').toUpperCase().replace(/\s+/g, '');
  const isHolidayExtras = profileNameUpper.includes('HOLIDAYEXTRAS');

  const errors: RowError[] = [];
  const warnings: RowIssue[] = [];
  let insertedCount = 0;
  let updatedCount = 0;

  const recordError = async (rowIndex: number, reference: string, reason: string, rowData: unknown) => {
    errors.push({ rowIndex, reference, reason });
    await logImportError({ tenantId, importFileId: null, importRunId: runId, rowIndex, reason, rowData });
  };

  // Same reference twice in this request: keep the last row, report the rest.
  const inRows: InRow[] = (rows as InRow[]).map((r, i) => ({
    ...r,
    reference: String(r?.reference ?? '').trim().toUpperCase(),
    rowNumber: typeof r?.rowNumber === 'number' ? r.rowNumber : i + 1,
  }));
  const withRef = inRows.filter((r) => r.reference);
  for (const r of inRows.filter((r) => !r.reference)) {
    await recordError(r.rowNumber!, '', 'missing reference', r);
  }
  const { kept, duplicates } = dedupeByReference(withRef as Array<InRow & { reference: string }>);

  // Existing bookings for these references (one query per 200 references).
  const existingByRef = new Map<string, ExistingBooking[]>();
  const refs = Array.from(new Set(kept.map((r) => r.reference)));
  for (let i = 0; i < refs.length; i += 200) {
    const slice = refs.slice(i, i + 200);
    const { data, error } = await admin
      .from('bookings')
      .select('id, reference, source, status, gate_status, ops_status, anpr_status')
      .eq('tenant_id', tenantId)
      .in('reference', slice);
    if (error) {
      return NextResponse.json(
        { error: `Could not check existing bookings: ${error.message}`, runId },
        { status: 500 }
      );
    }
    for (const b of (data ?? []) as ExistingBooking[]) {
      const key = String(b.reference ?? '').toUpperCase();
      existingByRef.set(key, [...(existingByRef.get(key) ?? []), b]);
    }
  }

  for (const raw of kept) {
    const rowIndex = raw.rowNumber!;
    const reference = raw.reference;
    try {
      const times = await resolveTimes(raw.start_at, raw.end_at, tz);
      if (!times.ok) {
        await recordError(rowIndex, reference, times.reason, { ...raw, _rawRow: undefined });
        continue;
      }

      let phoneValue = raw.phone;
      if (isHolidayExtras && raw._rawRow) {
        const foundPhone = pickBestPhoneFromRow(raw._rawRow);
        if (foundPhone) phoneValue = foundPhone;
      }

      const price = parseMoney(raw.price);
      const moneyReceived = parseMoney(raw.money_received);
      const newStatus = mapImportStatus(raw.status);

      const mappedRow = mapStagingToBookings({
        tenant_id: tenantId,
        source: sourceMapping || 'other',
        reference,
        customer_name: raw.customer_name,
        customer_lastname: raw.customer_lastname,
        customer_title: raw.customer_title,
        customer_firstname: raw.customer_firstname,
        start_at: times.start_at,
        end_at: times.end_at,
        vehicle_reg: raw.vehicle_reg,
        vehicle_colour: raw.vehicle_colour,
        vehicle_make: raw.vehicle_make,
        vehicle_model: raw.vehicle_model,
        flight_number: raw.flight_number,
        phone: phoneValue,
        external_status: normalizeSupplierStatus(raw.status),
        price,
        money_received: moneyReceived,
        notes: raw.notes,
        dedupe_key: makeImportDedupeKey({
          source: String(raw.source ?? ''),
          reference,
          vehicle_reg: String(raw.vehicle_reg ?? ''),
          start_utc: times.start_at,
        }),
      });
      // mapStagingToBookings only knows supplier tokens; use the import mapping (No Show, Refunded…).
      mappedRow.status = newStatus ?? 'reserved';

      const safePayload = toBookingInsertPayload({
        ...mappedRow,
        ...cancellationOpsFields(mappedRow.status),
        tenant_id: tenantId,
        updated_at: new Date().toISOString(),
      });
      if (!safePayload.ok) {
        await recordError(rowIndex, reference, safePayload.error, mappedRow);
        continue;
      }

      const match = pickExistingMatch(existingByRef.get(reference), reference, mappedRow.source);
      if (match.kind === 'ambiguous') {
        await recordError(
          rowIndex,
          reference,
          `reference matches ${match.count} existing bookings from different channels; not applied`,
          mappedRow
        );
        continue;
      }

      if (match.kind === 'match') {
        if (!overwrite) {
          duplicates.push({ rowNumber: rowIndex, reference, reason: 'already exists; not updated (update existing is off)' });
          continue;
        }
        const { update, warnings: w } = buildImportUpdatePayload(match.booking, safePayload.data, {
          newStatus,
          priceGiven: price !== null,
          receivedGiven: moneyReceived !== null,
          nameMissing: Boolean(mappedRow.is_incomplete),
        });
        const { error } = await writeBooking({ kind: 'update', id: match.booking.id, tenantId }, update);
        if (error) {
          await recordError(rowIndex, reference, `DB update error: ${error.message}`, update);
          continue;
        }
        for (const reason of w) warnings.push({ rowNumber: rowIndex, reference, reason });
        updatedCount++;
        continue;
      }

      const { error } = await writeBooking({ kind: 'insert' }, safePayload.data);
      if (error) {
        const reason =
          error.code === '23505'
            ? 'a booking with this reference already exists (created while importing?); not imported'
            : `DB insert error: ${error.message}`;
        await recordError(rowIndex, reference, reason, safePayload.data);
        continue;
      }
      insertedCount++;
    } catch (err: any) {
      await recordError(rowIndex, reference, `unexpected import error: ${err?.message ?? String(err)}`, {
        ...raw,
        _rawRow: undefined,
      });
    }
  }

  const successCount = insertedCount + updatedCount;
  const skippedCount = duplicates.length;
  console.log(
    `[IMPORT] tenant=${tenantId} run=${runId} rows=${rows.length} inserted=${insertedCount} updated=${updatedCount} duplicates=${skippedCount} errors=${errors.length}`
  );

  await admin
    .from("import_runs")
    .update({
      inserted_count: prevCounts.inserted + successCount,
      skipped_duplicates: prevCounts.skipped + skippedCount,
      error_count: prevCounts.errors + errors.length,
    })
    .eq("id", runId);

  return NextResponse.json({
    success: errors.length === 0,
    successCount,
    insertedCount,
    updatedCount,
    skippedCount,
    duplicates,
    warnings,
    errorCount: errors.length,
    errors,
    runId,
  });
}
