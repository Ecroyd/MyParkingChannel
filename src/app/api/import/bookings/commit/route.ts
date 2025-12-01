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
  const supabase = supabaseAdmin();

  // Create run
  console.log("📝 Creating import run with tenant_id:", tenantId);
  const { data: run, error: runErr } = await supabase
    .from("import_runs")
    .insert({ tenant_id: tenantId, profile_name: profileName || null })
    .select("id")
    .single();
  
  if (runErr || !run) {
    console.error("❌ Failed to create run:", runErr);
    return NextResponse.json({ error: runErr?.message || "Failed to create run" }, { status: 400 });
  }
  
  console.log("✅ Created run:", run.id);

  // Process the pre-processed preview data and filter out invalid rows
  const dateErrorRows: any[] = [];
  const importErrors: Array<{ rowIndex: number; reason: string; rowData: any }> = [];
  
  // Parse dates using Postgres RPC function (handles all formats, converts to UTC)
  const tz = 'Europe/London';
  const prepared: Array<{ booking: any; originalRowIndex: number; originalRow: any }> = [];
  
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowIndex = i + 1;
    // Capture raw values
    const startAtRaw = r.start_at;
    const endAtRaw = r.end_at;
    
    // Build list of specific errors
    const errors: string[] = [];
    
    // Check for missing raw values
    if (!startAtRaw || (typeof startAtRaw === 'string' && startAtRaw.trim() === '')) {
      errors.push('missing raw start_at value');
    }
    if (!endAtRaw || (typeof endAtRaw === 'string' && endAtRaw.trim() === '')) {
      errors.push('missing raw end_at value');
    }
    
    // Attempt to parse dates if we have raw values
    let startAtParsed: string | null = null;
    let endAtParsed: string | null = null;
    
    if (startAtRaw && (typeof startAtRaw !== 'string' || startAtRaw.trim() !== '') &&
        endAtRaw && (typeof endAtRaw !== 'string' || endAtRaw.trim() !== '')) {
      try {
        const { data: parsed, error: parseErr } = await supabase
          .rpc('normalise_booking_times', {
            p_start: startAtRaw,
            p_end: endAtRaw,
            p_tz: tz
          });
        
        if (parseErr) {
          errors.push(`could not parse start_at="${startAtRaw}"`);
          errors.push(`could not parse end_at="${endAtRaw}"`);
        } else if (!parsed || parsed.length === 0) {
          errors.push(`could not parse start_at="${startAtRaw}"`);
          errors.push(`could not parse end_at="${endAtRaw}"`);
        } else {
          startAtParsed = parsed[0].start_utc || null;
          endAtParsed = parsed[0].end_utc || null;
          
          if (!startAtParsed) {
            errors.push(`could not parse start_at="${startAtRaw}"`);
          } else {
            // Check if parsed date is invalid
            const startDate = new Date(startAtParsed);
            if (isNaN(startDate.getTime())) {
              errors.push(`start_at parsed to invalid date: ${startAtParsed}`);
            }
          }
          
          if (!endAtParsed) {
            errors.push(`could not parse end_at="${endAtRaw}"`);
          } else {
            // Check if parsed date is invalid
            const endDate = new Date(endAtParsed);
            if (isNaN(endDate.getTime())) {
              errors.push(`end_at parsed to invalid date: ${endAtParsed}`);
            }
          }
          
          // If we have both parsed dates, check if end is before start
          if (startAtParsed && endAtParsed) {
            const startDate = new Date(startAtParsed);
            const endDate = new Date(endAtParsed);
            if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime()) && endDate < startDate) {
              errors.push('end_at is before start_at');
            }
          }
        }
      } catch (err) {
        errors.push(`could not parse start_at="${startAtRaw}"`);
        errors.push(`could not parse end_at="${endAtRaw}"`);
      }
    }
    
    // If there are any errors, write to booking_import_errors and skip this row
    if (errors.length > 0) {
      const reason = `startAt/endAt error: ${errors.join('; ')}`;
      
      const debugRow = {
        ...r,
        _debug_dates: {
          startAtRaw,
          endAtRaw,
          startAtParsed,
          endAtParsed,
        }
      };
      
      // Write error to booking_import_errors using supabaseAdmin
      await supabase
        .from('booking_import_errors')
        .insert({
          tenant_id: tenantId,
          import_file_id: null, // We use import_run_id instead
          import_run_id: run.id,
          row_index: rowIndex,
          reason: reason,
          row_data: debugRow,
        });
      
      dateErrorRows.push({
        index: rowIndex,
        row: r,
        reason: reason
      });
      importErrors.push({ rowIndex, reason, rowData: debugRow });
      continue; // Skip this row
    }
    
    // If we got here, dates parsed successfully
    // Type guard: ensure both parsed dates are non-null strings
    if (!startAtParsed || !endAtParsed) {
      // This shouldn't happen if validation passed, but handle it safely
      const reason = `startAt/endAt error: parsed dates are null after validation`;
      const debugRow = {
        ...r,
        _debug_dates: {
          startAtRaw,
          endAtRaw,
          startAtParsed,
          endAtParsed,
        }
      };
      await supabase
        .from('booking_import_errors')
        .insert({
          tenant_id: tenantId,
          import_file_id: null, // We use import_run_id instead
          import_run_id: run.id,
          row_index: rowIndex,
          reason: reason,
          row_data: debugRow,
        });
      dateErrorRows.push({
        index: rowIndex,
        row: r,
        reason: reason
      });
      importErrors.push({ rowIndex, reason, rowData: debugRow });
      continue;
    }
    
    try {
      const start_utc: string = startAtParsed;
      const end_utc: string = endAtParsed;
      const dedupe_key = makeImportDedupeKey({
        source: r.source,
        reference: r.reference,
        vehicle_reg: r.vehicle_reg,
        start_utc: start_utc
      });
      
      const stagingRecord = {
        tenant_id: tenantId,
        source: sourceMapping || 'other',
        reference: r.reference,
        customer_name: r.customer_name,
        customer_lastname: r.customer_lastname,
        customer_title: r.customer_title,
        customer_firstname: r.customer_firstname,
        start_at: start_utc, // Already UTC from Postgres
        end_at: end_utc,     // Already UTC from Postgres
        vehicle_reg: r.vehicle_reg,
        vehicle_colour: r.vehicle_colour,
        vehicle_make: r.vehicle_make,
        vehicle_model: r.vehicle_model,
        flight_number: r.flight_number,
        phone: r.phone,
        status: r.status,
        price: r.price,
        money_received: r.money_received,
        notes: r.notes,
        dedupe_key
      };

      const mappedBooking = mapStagingToBookings(stagingRecord);
      
      // Additional validation on the mapped booking
      const validationErrors: string[] = [];
      
      // Validate required fields
      if (!mappedBooking.reference || (typeof mappedBooking.reference === 'string' && mappedBooking.reference.trim() === '')) {
        validationErrors.push('missing or empty reference');
      }
      if (!mappedBooking.customer_name || (typeof mappedBooking.customer_name === 'string' && mappedBooking.customer_name.trim() === '')) {
        validationErrors.push('missing or empty customer_name');
      }
      
      // Validate dates one more time on the mapped object
      if (!mappedBooking.start_at || (typeof mappedBooking.start_at === 'string' && mappedBooking.start_at.trim() === '')) {
        validationErrors.push(`missing start_at parsed value (raw="${String(startAtRaw ?? "")}")`);
      } else {
        const d = new Date(mappedBooking.start_at);
        if (isNaN(d.getTime())) {
          validationErrors.push(`start_at parsed to invalid Date: "${mappedBooking.start_at}" (raw="${String(startAtRaw ?? "")}")`);
        }
      }
      
      if (!mappedBooking.end_at || (typeof mappedBooking.end_at === 'string' && mappedBooking.end_at.trim() === '')) {
        validationErrors.push(`missing end_at parsed value (raw="${String(endAtRaw ?? "")}")`);
      } else {
        const d = new Date(mappedBooking.end_at);
        if (isNaN(d.getTime())) {
          validationErrors.push(`end_at parsed to invalid Date: "${mappedBooking.end_at}" (raw="${String(endAtRaw ?? "")}")`);
        }
      }
      
      if (mappedBooking.start_at && mappedBooking.end_at) {
        const s = new Date(mappedBooking.start_at);
        const e = new Date(mappedBooking.end_at);
        if (!isNaN(s.getTime()) && !isNaN(e.getTime()) && e < s) {
          validationErrors.push('end_at is before start_at');
        }
      }
      
      if (validationErrors.length > 0) {
        const reason = `validation error: ${validationErrors.join('; ')}`;
        const debugRow = {
          ...mappedBooking,
          _debug_dates: {
            startAtRaw,
            endAtRaw,
            startAtParsed: mappedBooking.start_at,
            endAtParsed: mappedBooking.end_at,
          },
        };
        
        await supabase
          .from('booking_import_errors')
          .insert({
            tenant_id: tenantId,
            import_file_id: null,
            import_run_id: run.id,
            row_index: rowIndex,
            reason: reason,
            row_data: debugRow,
          });
        
        importErrors.push({ rowIndex, reason, rowData: debugRow });
        continue;
      }
      
      // Store the booking with its original row index for error tracking
      prepared.push({
        booking: mappedBooking,
        originalRowIndex: rowIndex,
        originalRow: r
      });
    } catch (error: any) {
      const reason = `unexpected import error: ${error?.message ?? String(error)}`;
      const debugRow = {
        ...r,
        _error: error?.stack ?? String(error),
        _debug_dates: {
          startAtRaw,
          endAtRaw,
          startAtParsed,
          endAtParsed,
        },
      };
      
      await supabase
        .from('booking_import_errors')
        .insert({
          tenant_id: tenantId,
          import_file_id: null,
          import_run_id: run.id,
          row_index: rowIndex,
          reason: reason,
          row_data: debugRow,
        });
      
      importErrors.push({ rowIndex, reason, rowData: debugRow });
      console.error(`Error processing row ${rowIndex} (${r.reference}):`, error);
      continue;
    }
  }
  
  console.log(`📊 Valid rows: ${prepared.length}, Date error rows: ${dateErrorRows.length}`);
  
  if (dateErrorRows.length > 0) {
    console.log("❌ Date error rows found:", dateErrorRows);
  }
  
  console.log("📊 Prepared records count:", prepared.length);
  console.log("📊 Sample prepared record:", prepared[0]?.booking);
  console.log("📊 Tenant ID in sample:", prepared[0]?.booking?.tenant_id);
  console.log("📊 Source in sample:", prepared[0]?.booking?.source);
  console.log("📊 Start_at in sample:", prepared[0]?.booking?.start_at);
  console.log("📊 End_at in sample:", prepared[0]?.booking?.end_at);

  let inserted = 0, updated = 0, skipped = 0, errors = 0;
  const serverErrors: string[] = [];

  // Process each prepared booking individually to catch per-row errors
  for (const item of prepared) {
    const { booking, originalRowIndex, originalRow } = item;
    
    try {
      // Check if booking already exists
      const { data: existing, error: probeErr } = await supabase
        .from("bookings")
        .select("id, dedupe_key")
        .eq("tenant_id", tenantId)
        .eq("dedupe_key", booking.dedupe_key)
        .maybeSingle();

      if (probeErr) {
        const reason = `DB probe error: ${probeErr.message ?? probeErr.toString()}`;
        await supabase
          .from('booking_import_errors')
          .insert({
            tenant_id: tenantId,
            import_file_id: null,
            import_run_id: run.id,
            row_index: originalRowIndex,
            reason: reason,
            row_data: booking,
          });
        importErrors.push({ rowIndex: originalRowIndex, reason, rowData: booking });
        errors++;
        continue;
      }

      if (existing) {
        // Booking already exists
        if (overwriteDuplicates) {
          // Update existing booking
          const { error: updateErr } = await supabase
            .from("bookings")
            .update(booking)
            .eq("id", existing.id)
            .eq("tenant_id", tenantId);
          
          if (updateErr) {
            const reason = `DB update error: ${updateErr.message ?? updateErr.toString()}`;
            await supabase
              .from('booking_import_errors')
              .insert({
                tenant_id: tenantId,
                import_file_id: null,
                import_run_id: run.id,
                row_index: originalRowIndex,
                reason: reason,
                row_data: booking,
              });
            importErrors.push({ rowIndex: originalRowIndex, reason, rowData: booking });
            errors++;
          } else {
            updated++;
          }
        } else {
          // Skip duplicate
          skipped++;
        }
      } else {
        // Insert new booking
        const { error: insErr } = await supabase
          .from("bookings")
          .insert(booking);
        
        if (insErr) {
          const reason = `DB insert error: ${insErr.message ?? insErr.toString()}`;
          const debugRow = {
            ...booking,
            _error_details: {
              code: insErr.code,
              details: insErr.details,
              hint: insErr.hint,
            },
          };
          await supabase
            .from('booking_import_errors')
            .insert({
              tenant_id: tenantId,
              import_file_id: null,
              import_run_id: run.id,
              row_index: originalRowIndex,
              reason: reason,
              row_data: debugRow,
            });
          importErrors.push({ rowIndex: originalRowIndex, reason, rowData: debugRow });
          errors++;
        } else {
          inserted++;
        }
      }
    } catch (err: any) {
      const reason = `unexpected DB operation error: ${err?.message ?? String(err)}`;
      const debugRow = {
        ...booking,
        _error: err?.stack ?? String(err),
      };
      await supabase
        .from('booking_import_errors')
        .insert({
          tenant_id: tenantId,
          import_file_id: null,
          import_run_id: run.id,
          row_index: originalRowIndex,
          reason: reason,
          row_data: debugRow,
        });
      importErrors.push({ rowIndex: originalRowIndex, reason, rowData: debugRow });
      errors++;
      console.error(`Error processing booking for row ${originalRowIndex} (${booking.reference}):`, err);
    }
  }

  await supabase.from("import_runs")
    .update({ inserted_count: inserted, skipped_duplicates: skipped, error_count: errors })
    .eq("id", run.id);

  const result = { 
    ok: errors === 0, 
    runId: run.id, 
    inserted, 
    updated, 
    skipped, 
    errors,
    serverErrors,
    invalidRows: dateErrorRows.length > 0 ? dateErrorRows : undefined,
    importErrors: importErrors.length > 0 ? importErrors : undefined
  };
  const status = errors ? 207 /* multi-status */ : 200;
  return NextResponse.json(result, { status });
}

function* chunked<T>(arr: T[], size = 1000) {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}
