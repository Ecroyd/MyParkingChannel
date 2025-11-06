import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import crypto from "crypto";
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
  const validRows: any[] = [];
  const invalidRows: any[] = [];
  
  rows.forEach((r, index) => {
    // Check if row has valid timestamps
    const hasValidStart = r.start_at && r.start_at.trim() !== '';
    const hasValidEnd = r.end_at && r.end_at.trim() !== '';
    
    if (!hasValidStart || !hasValidEnd) {
      invalidRows.push({
        index: index + 1,
        row: r,
        reason: !hasValidStart && !hasValidEnd ? 'Missing start and end dates' : 
                !hasValidStart ? 'Missing start date' : 'Missing end date'
      });
      return; // Skip this row
    }
    
    validRows.push(r);
  });

  console.log(`📊 Valid rows: ${validRows.length}, Invalid rows: ${invalidRows.length}`);
  
  if (invalidRows.length > 0) {
    console.log("❌ Invalid rows found:", invalidRows);
  }

  // Parse dates using Postgres RPC function (handles all formats, converts to UTC)
  const tz = 'Europe/London';
  const prepared: any[] = [];
  
  for (const r of validRows) {
    try {
      // Use RPC function to parse and normalize to UTC in the database
      const { data: parsed, error: parseErr } = await supabase
        .rpc('normalise_booking_times', {
          p_start: r.start_at,
          p_end: r.end_at,
          p_tz: tz
        });

      if (parseErr || !parsed || parsed.length === 0 || !parsed[0].start_utc || !parsed[0].end_utc) {
        console.error(`Failed to parse dates for row ${r.reference}:`, parseErr);
        // Skip this row or use fallback
        continue;
      }

      const { start_utc, end_utc } = parsed[0];
      const dedupe_key = crypto.createHash("sha256").update(`${r.source.toLowerCase()}|${r.reference.toUpperCase()}|${r.vehicle_reg.toUpperCase()}|${start_utc}`).digest("hex");
      
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

      prepared.push(mapStagingToBookings(stagingRecord));
    } catch (error) {
      console.error(`Error processing row ${r.reference}:`, error);
      // Skip this row
      continue;
    }
  }
  
  console.log("📊 Prepared records count:", prepared.length);
  console.log("📊 Sample prepared record:", prepared[0]);
  console.log("📊 Tenant ID in sample:", prepared[0]?.tenant_id);
  console.log("📊 Source in sample:", prepared[0]?.source);
  console.log("📊 Start_at in sample:", prepared[0]?.start_at);
  console.log("📊 End_at in sample:", prepared[0]?.end_at);

  let inserted = 0, updated = 0, skipped = 0, errors = 0;
  const serverErrors: string[] = [];

  for (const chunk of chunked(prepared, 500)) {
    // probe existing keys first so "skipped" is accurate
    const keys = chunk.map(c => c.dedupe_key);
    const { data: existing, error: probeErr } = await supabase
      .from("bookings")
      .select("dedupe_key")
      .eq("tenant_id", tenantId)
      .in("dedupe_key", keys);

    if (probeErr) {
      errors += chunk.length;
      serverErrors.push(`probe: ${probeErr.message}`);
      continue;
    }

    const existingSet = new Set((existing ?? []).map(e => e.dedupe_key));
    const newRows = chunk.filter(c => !existingSet.has(c.dedupe_key));
    const oldRows = chunk.filter(c => existingSet.has(c.dedupe_key));

    if (overwriteDuplicates) {
      console.log("🔄 Upserting chunk with", chunk.length, "records");
      console.log("🔄 Sample chunk record:", chunk[0]);
      console.log("🔄 Sample tenant_id:", chunk[0]?.tenant_id);
      console.log("🔄 Sample source:", chunk[0]?.source);
      
      const { error: upErr } = await supabase
        .from("bookings")
        .upsert(chunk, { onConflict: "tenant_id,dedupe_key" });
      if (upErr) {
        console.error("❌ Upsert error:", upErr);
        console.error("❌ Upsert error details:", upErr.details);
        console.error("❌ Upsert error hint:", upErr.hint);
        errors += chunk.length;
        serverErrors.push(`upsert: ${upErr.message}`);
        continue;
      }
      inserted += newRows.length;
      updated  += oldRows.length;
    } else {
      if (newRows.length) {
        console.log("📥 Inserting", newRows.length, "new records");
        console.log("📥 Sample new record:", newRows[0]);
        console.log("📥 Sample tenant_id:", newRows[0]?.tenant_id);
        console.log("📥 Sample source:", newRows[0]?.source);
        
        const { error: insErr, count } = await supabase
          .from("bookings")
          .insert(newRows, { count: "exact" });
        if (insErr) {
          console.error("❌ Insert error:", insErr);
          console.error("❌ Insert error details:", insErr.details);
          console.error("❌ Insert error hint:", insErr.hint);
          errors += newRows.length;
          serverErrors.push(`insert: ${insErr.message}`);
        } else {
          inserted += count ?? newRows.length;
        }
      }
      skipped += oldRows.length;
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
    invalidRows: invalidRows.length > 0 ? invalidRows : undefined
  };
  const status = errors ? 207 /* multi-status */ : 200;
  return NextResponse.json(result, { status });
}

function* chunked<T>(arr: T[], size = 1000) {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}
