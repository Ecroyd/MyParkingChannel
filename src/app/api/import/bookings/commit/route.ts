import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { makeImportDedupeKey } from "@/lib/bookings/dedupe";
import { mapStagingToBookings } from "@/lib/imports/mapToBookings";

type InRow = {
  source:string; reference:string;
  customer_name:string; customer_lastname:string; customer_title:string; customer_firstname:string;
  start_at:string; end_at:string;
  vehicle_reg:string; vehicle_colour:string; vehicle_make:string; vehicle_model:string;
  flight_number:string; phone:string; status:string; price:any; money_received:any; notes:string;
  raw?: any;
};

function toNumberOrNull(v:any): number|null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

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
// Note: Date parsing is now done via RPC function in the prepare step
// This function is kept for backward compatibility but dates should be parsed via RPC
function sanitize(r: InRow) {
  return {
    source: (r.source||"").toString().toUpperCase(),
    reference: (r.reference||"").toString().toUpperCase(),
    customer_name: (r.customer_name||"").toString(),
    customer_lastname: (r.customer_lastname||"").toString().toUpperCase(),
    customer_title: (r.customer_title||"").toString().toUpperCase(),
    customer_firstname: (r.customer_firstname||"").toString(),
    start_at: r.start_at, // Will be parsed via RPC in prepare step
    end_at: r.end_at,     // Will be parsed via RPC in prepare step
    vehicle_reg: (r.vehicle_reg||"").toString().toUpperCase(),
    vehicle_colour: (r.vehicle_colour||"").toString().toUpperCase(),
    vehicle_make: (r.vehicle_make||"").toString().toUpperCase(),
    vehicle_model: (r.vehicle_model||"").toString().toUpperCase(),
    flight_number: (r.flight_number||"").toString().toUpperCase(),
    phone: (r.phone||"").toString(),
    status: (r.status||"reserved").toString(),
    price: toNumberOrNull(r.price),
    money_received: toNumberOrNull(r.money_received),
    notes: (r.notes||"").toString(),
    raw: r.raw ?? null,
  };
}

function keyOf(s:any) {
  // include start_at even if null; the string 'null' is consistent across runs
  return [
    (s.source||"").toLowerCase(),
    (s.reference||"").toUpperCase(),
    (s.vehicle_reg||"").toUpperCase(),
    s.start_at ?? "null",
  ].join("|");
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

export async function POST(req: Request) {
  const { tenantId, rows, profileName, overwriteDuplicates, sourceMapping } = await req.json();
  
  console.log("🔍 API Debug Info:");
  console.log("Received tenantId:", tenantId);
  console.log("Received rows count:", rows?.length);
  console.log("Received profileName:", profileName);
  console.log("Received overwriteDuplicates:", overwriteDuplicates);
  console.log("Received sourceMapping:", sourceMapping);
  
  if (!tenantId || !Array.isArray(rows)) {
    console.error("❌ Missing required fields:", { tenantId, rowsIsArray: Array.isArray(rows) });
    return NextResponse.json({ error: "tenantId and rows required" }, { status: 400 });
  }

  // Create run
  console.log("📝 Creating import run with tenant_id:", tenantId);
  const { data: run, error: runErr } = await supabaseAdmin()
    .from("import_runs")
    .insert({ tenant_id: tenantId, profile_name: profileName || null })
    .select("id")
    .single();
  
  if (runErr || !run) {
    console.error("❌ Failed to create run:", runErr);
    return NextResponse.json({ error: runErr?.message || "Failed to create run" }, { status: 400 });
  }
  
  console.log("✅ Created run:", run.id);

  // Process rows and insert bookings directly
  const errors: Array<{ rowIndex: number; reason: string; rowData: any }> = [];
  let successCount = 0;
  let skippedCount = 0;
  const tz = 'Europe/London';
  const importFileId = null; // We use import_run_id instead

  console.log(`[IMPORT] Starting to process ${rows.length} rows for tenant ${tenantId}`);

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const rowIndex = i + 1;

    try {
      // 1) Map row according to existing logic
      const startAtRaw = raw.start_at;
      const endAtRaw = raw.end_at;
      
      // Parse dates using Postgres RPC function
      let startAtParsed: string | null = null;
      let endAtParsed: string | null = null;
      
      if (startAtRaw && (typeof startAtRaw !== 'string' || startAtRaw.trim() !== '') &&
          endAtRaw && (typeof endAtRaw !== 'string' || endAtRaw.trim() !== '')) {
        try {
          const { data: parsed, error: parseErr } = await supabaseAdmin()
            .rpc('normalise_booking_times', {
              p_start: startAtRaw,
              p_end: endAtRaw,
              p_tz: tz
            });
          
          if (!parseErr && parsed && parsed.length > 0) {
            startAtParsed = parsed[0].start_utc || null;
            endAtParsed = parsed[0].end_utc || null;
          }
        } catch (err) {
          // Will be caught in date validation below
        }
      }
      
      const dedupe_key = makeImportDedupeKey({
        source: raw.source,
        reference: raw.reference,
        vehicle_reg: raw.vehicle_reg,
        start_utc: startAtParsed || ''
      });
      
      // For Holiday Extras, use phone finder to scan all columns for the best phone candidate
      let phoneValue = raw.phone;
      const profileNameUpper = (profileName || '').toUpperCase().replace(/\s+/g, '');
      if (profileNameUpper === 'HOLIDAYEXTRAS' || profileNameUpper.includes('HOLIDAYEXTRAS')) {
        const rawRow = (raw as any)._rawRow;
        if (rawRow) {
          const foundPhone = pickBestPhoneFromRow(rawRow);
          if (foundPhone) {
            phoneValue = foundPhone;
          }
        }
      }

      const stagingRecord = {
        tenant_id: tenantId,
        source: sourceMapping || 'other',
        reference: raw.reference,
        customer_name: raw.customer_name,
        customer_lastname: raw.customer_lastname,
        customer_title: raw.customer_title,
        customer_firstname: raw.customer_firstname,
        start_at: startAtParsed || '',
        end_at: endAtParsed || '',
        vehicle_reg: raw.vehicle_reg,
        vehicle_colour: raw.vehicle_colour,
        vehicle_make: raw.vehicle_make,
        vehicle_model: raw.vehicle_model,
        flight_number: raw.flight_number,
        phone: phoneValue,
        status: raw.status,
        price: raw.price,
        money_received: raw.money_received,
        notes: raw.notes,
        dedupe_key
      };

      const mappedRow = mapStagingToBookings(stagingRecord);

      // 2) Perform date validation and build detailed dateErrors[] if needed
      const startAtVal = (mappedRow as any).start_at;
      const endAtVal = (mappedRow as any).end_at;

      const dateErrors: string[] = [];

      if (!startAtVal) {
        dateErrors.push(
          `missing start_at parsed value (raw="${String(startAtRaw ?? '')}")`
        );
      }
      if (!endAtVal) {
        dateErrors.push(
          `missing end_at parsed value (raw="${String(endAtRaw ?? '')}")`
        );
      }

      if (startAtVal) {
        const d = new Date(startAtVal);
        if (isNaN(d.getTime())) {
          dateErrors.push(
            `start_at parsed to invalid Date: "${startAtVal}" (raw="${String(
              startAtRaw ?? ''
            )}")`
          );
        }
      }

      if (endAtVal) {
        const d = new Date(endAtVal);
        if (isNaN(d.getTime())) {
          dateErrors.push(
            `end_at parsed to invalid Date: "${endAtVal}" (raw="${String(
              endAtRaw ?? ''
            )}")`
          );
        }
      }

      if (startAtVal && endAtVal) {
        const s = new Date(startAtVal);
        const e = new Date(endAtVal);
        if (!isNaN(s.getTime()) && !isNaN(e.getTime()) && e < s) {
          dateErrors.push('end_at is before start_at');
        }
      }

      if (dateErrors.length > 0) {
        const reason = `startAt/endAt error: ${dateErrors.join('; ')}`;
        const debugRow = {
          ...mappedRow,
          _debug_dates: {
            startAtRaw,
            endAtRaw,
            startAtParsed: startAtVal,
            endAtParsed: endAtVal,
          },
        };

        console.log(`[IMPORT] Row ${rowIndex} failed date validation: ${reason}`);
        errors.push({ rowIndex, reason, rowData: debugRow });
        console.log(`[IMPORT] Added error to errors array. Total errors: ${errors.length}`);

        await logImportError({
          tenantId,
          importFileId,
          importRunId: run.id,
          rowIndex,
          reason,
          rowData: debugRow,
        });

        continue;
      }

      // 3) Attempt DB insert/upsert for the booking
      // Check if booking already exists
      const { data: existing, error: probeErr } = await supabaseAdmin()
        .from("bookings")
        .select("id, dedupe_key")
        .eq("tenant_id", tenantId)
        .eq("dedupe_key", mappedRow.dedupe_key)
        .maybeSingle();

      if (probeErr) {
        const reason = `DB probe error: ${probeErr.message ?? probeErr.toString()}`;
        console.log(`[IMPORT] Row ${rowIndex} failed DB probe: ${reason}`);
        errors.push({ rowIndex, reason, rowData: mappedRow });
        console.log(`[IMPORT] Added error to errors array. Total errors: ${errors.length}`);

        await logImportError({
          tenantId,
          importFileId,
          importRunId: run.id,
          rowIndex,
          reason,
          rowData: mappedRow,
        });

        continue;
      }

      if (existing) {
        // Booking already exists - this is a duplicate
        console.log(`[IMPORT] Row ${rowIndex} - Duplicate booking found (dedupe_key: ${mappedRow.dedupe_key}, existing_id: ${existing.id})`);
        
        if (overwriteDuplicates) {
          // Update existing booking
          console.log(`[IMPORT] Row ${rowIndex} - Overwriting duplicate (overwriteDuplicates=true)`);
          const { error: updateErr } = await supabaseAdmin()
            .from("bookings")
            .update(mappedRow)
            .eq("id", existing.id)
            .eq("tenant_id", tenantId);
          
          if (updateErr) {
            const reason = `DB update error: ${updateErr.message ?? updateErr.toString()}`;
            console.log(`[IMPORT] Row ${rowIndex} failed DB update: ${reason}`);
            errors.push({ rowIndex, reason, rowData: mappedRow });
            console.log(`[IMPORT] Added error to errors array. Total errors: ${errors.length}`);

            await logImportError({
              tenantId,
              importFileId,
              importRunId: run.id,
              rowIndex,
              reason,
              rowData: mappedRow,
            });

            continue;
          } else {
            console.log(`[IMPORT] Row ${rowIndex} successfully updated existing booking (duplicate overwritten)`);
            successCount++;
          }
        } else {
          // Skip duplicate - this is success, not an error
          console.log(`[IMPORT] Row ${rowIndex} skipped (duplicate found, overwriteDuplicates=false) - NOT an error`);
          skippedCount++;
          console.log(`[IMPORT] Skipped count now: ${skippedCount}, Success count: ${successCount}, Errors: ${errors.length}`);
          continue;
        }
      } else {
        // Insert new booking
        const { error: insertError } = await supabaseAdmin()
          .from('bookings')
          .insert(mappedRow);

        if (insertError) {
          const reason = `DB insert error: ${insertError.message ?? insertError.toString()}`;
          console.log(`[IMPORT] Row ${rowIndex} failed DB insert: ${reason}`);
          errors.push({ rowIndex, reason, rowData: mappedRow });
          console.log(`[IMPORT] Added error to errors array. Total errors: ${errors.length}`);

          await logImportError({
            tenantId,
            importFileId,
            importRunId: run.id,
            rowIndex,
            reason,
            rowData: mappedRow,
          });

          continue;
        } else {
          console.log(`[IMPORT] Row ${rowIndex} successfully inserted new booking`);
          successCount++;
        }
      }
    } catch (err: any) {
      const reason = `unexpected import error: ${
        err?.message ?? String(err)
      }`;
      console.log(`[IMPORT] Row ${rowIndex} threw unexpected error: ${reason}`);
      errors.push({ rowIndex, reason, rowData: raw });
      console.log(`[IMPORT] Added error to errors array. Total errors: ${errors.length}`);

      await logImportError({
        tenantId,
        importFileId,
        importRunId: run.id,
        rowIndex,
        reason,
        rowData: raw,
      });
    }
  }

  console.log(`[IMPORT] Processing complete. Total rows: ${rows.length}, Success: ${successCount}, Skipped (duplicates): ${skippedCount}, Errors: ${errors.length}`);
  if (skippedCount > 0) {
    console.log(`[IMPORT] ⚠️ ${skippedCount} duplicate(s) were skipped (not overwritten)`);
  }

  await supabaseAdmin().from("import_runs")
    .update({ inserted_count: successCount, skipped_duplicates: skippedCount, error_count: errors.length })
    .eq("id", run.id);

  const result = {
    success: errors.length === 0,
    successCount,
    skippedCount,
    errorCount: errors.length,
    errors,
    runId: run.id,
  };

  console.log(`[IMPORT] Final result:`, JSON.stringify(result, null, 2));

  return NextResponse.json(result);
}

function* chunked<T>(arr: T[], size = 1000) {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}
