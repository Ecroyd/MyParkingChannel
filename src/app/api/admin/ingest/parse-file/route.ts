import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

// Parse APH .txt file (same logic as parseExtTxtFile but works with Buffer)
function parseAphTxtFile(buffer: Buffer) {
  const text = buffer.toString("utf-8");
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const rows: any[] = [];

  for (const line of lines) {
    // Split by tab or >=2 spaces
    const cols = line.split(/\t+|\s{2,}/).map(v => v.replace(/"/g, "").trim());

    // Skip if it doesn't look like a valid row (needs ref + surname)
    if (!cols[2] || !cols[3]) continue;

    const arrivalDateRaw = safeGet(cols, 8);
    const arrivalTimeRaw = safeGet(cols, 7);
    const departDateRaw = safeGet(cols, 13);
    const departTimeRaw = safeGet(cols, 14);

    const customerFirstname = safeGet(cols, 5);
    const customerLastname = safeGet(cols, 3);
    const customerName = `${customerFirstname} ${customerLastname}`.trim();

    rows.push({
      source: safeGet(cols, 1),
      reference: safeGet(cols, 2),
      customer_name: customerName,
      customer_lastname: customerLastname,
      customer_title: safeGet(cols, 4),
      customer_firstname: customerFirstname,
      start_at: parseDate(arrivalDateRaw, arrivalTimeRaw),
      end_at: parseDate(departDateRaw, departTimeRaw),
      vehicle_reg: safeGet(cols, 15),
      vehicle_colour: safeGet(cols, 17),
      vehicle_make: safeGet(cols, 18),
      vehicle_model: safeGet(cols, 19),
      flight_number: safeGet(cols, 20),
      phone: normalizePhone(safeGet(cols, 21)),
      status: normalizeStatus(safeGet(cols, 10) || safeGet(cols, 11)),
      price: parseFloat(safeGet(cols, 12)) || 0,
      money_received: parseFloat(safeGet(cols, 13)) || 0,
      notes: buildNotes(cols),
    });
  }

  const headers = Object.keys(rows[0] ?? {});
  return { headers, rows };
}

function safeGet(arr: string[], i: number) {
  return (arr[i] ?? "").trim();
}

function parseDate(dateStr?: string, timeStr?: string) {
  if (!dateStr || !/^\d{6}$/.test(dateStr)) return null;
  const [d, m, y] = [dateStr.slice(0, 2), dateStr.slice(2, 4), "20" + dateStr.slice(4, 6)];
  const [h, min] = (timeStr || "00:00").split(":").map(Number);
  if (isNaN(h) || isNaN(min)) return null;
  return new Date(Date.UTC(+y, +m - 1, +d, h, min)).toISOString();
}

function normalizeStatus(raw: string) {
  const t = (raw || "").toLowerCase();
  if (t.includes("canx")) return "cancelled";
  if (t.includes("firm")) return "reserved";
  if (t.includes("amnd")) return "reserved";
  if (t.includes("dep") || t.includes("out")) return "checked_out";
  if (t.includes("arr") || t.includes("in")) return "checked_in";
  return "reserved";
}

function normalizePhone(p: string) {
  return p.replace(/\s+/g, "").replace(/^0+/, "").replace(/^44?/, "0");
}

function buildNotes(cols: string[]) {
  const bits = [safeGet(cols, 9), safeGet(cols, 16), safeGet(cols, 17)]
    .filter(Boolean)
    .join(" / ");
  return bits || null;
}

export async function POST(req: Request) {
  try {
    const { fileId, tenantId } = await req.json();

    if (!fileId) {
      return NextResponse.json({ error: "fileId required" }, { status: 400 });
    }
    if (!tenantId) {
      return NextResponse.json({ error: "tenantId required" }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    // 1. Get file record
    const { data: file, error: fileError } = await supabase
      .from("ingest_email_files")
      .select("*, ingest_emails(*)")
      .eq("id", fileId)
      .single();

    if (fileError || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    if (file.parse_status === "parsed") {
      return NextResponse.json({ 
        ok: true, 
        message: "File already parsed",
        fileId: file.id,
      });
    }

    // 2. Download file from Storage
    console.log(`[parse-file] Downloading ${file.filename} from ${file.storage_bucket}/${file.storage_path}`);
    
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(file.storage_bucket)
      .download(file.storage_path);

    if (downloadError || !fileData) {
      console.error(`[parse-file] Download failed:`, downloadError);
      await supabase
        .from("ingest_email_files")
        .update({ 
          parse_status: "failed", 
          parse_error: `Download failed: ${downloadError?.message || "unknown"}` 
        })
        .eq("id", fileId);
      
      return NextResponse.json({ 
        error: `Download failed: ${downloadError?.message}` 
      }, { status: 500 });
    }

    // 3. Convert to Buffer
    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 4. Parse file using APH parser
    console.log(`[parse-file] Parsing ${file.filename}...`);
    let parsedData;
    try {
      // Detect file type and use appropriate parser
      if (file.filename.toLowerCase().endsWith('.txt') || file.filename.toLowerCase().includes('aph')) {
        parsedData = parseAphTxtFile(buffer);
      } else {
        // Fallback: try CSV parsing or other formats
        throw new Error(`Unsupported file type: ${file.filename}`);
      }
      console.log(`[parse-file] Parsed ${parsedData.rows.length} rows from ${file.filename}`);
    } catch (parseErr: any) {
      console.error(`[parse-file] Parse failed:`, parseErr);
      await supabase
        .from("ingest_email_files")
        .update({ 
          parse_status: "failed", 
          parse_error: `Parse failed: ${parseErr.message}` 
        })
        .eq("id", fileId);
      
      return NextResponse.json({ 
        error: `Parse failed: ${parseErr.message}` 
      }, { status: 500 });
    }

    if (!parsedData.rows || parsedData.rows.length === 0) {
      await supabase
        .from("ingest_email_files")
        .update({ 
          parse_status: "failed", 
          parse_error: "No valid rows found in file" 
        })
        .eq("id", fileId);
      
      return NextResponse.json({ 
        error: "No valid rows found in file" 
      }, { status: 400 });
    }

    // 5. Import bookings using existing import logic directly
    console.log(`[parse-file] Importing ${parsedData.rows.length} bookings for tenant ${tenantId}...`);
    
    // Import the commit route logic directly
    const { supabaseAdmin } = await import("@/lib/supabase/server");
    const { makeImportDedupeKey } = await import("@/lib/bookings/dedupe");
    
    const adminSupabase = supabaseAdmin();
    
    // Create import run
    const { data: run, error: runErr } = await adminSupabase
      .from("import_runs")
      .insert({ 
        tenant_id: tenantId, 
        profile_name: `Email import: ${file.filename}`,
        meta: { email_file_id: fileId, email_id: (file as any).ingest_emails?.id }
      })
      .select("id")
      .single();
    
    if (runErr || !run) {
      throw new Error(`Failed to create import run: ${runErr?.message}`);
    }

    // Process rows (simplified version - you may want to use the full commit logic)
    let successCount = 0;
    let errorCount = 0;
    const errors: any[] = [];
    const tz = 'Europe/London';

    for (let i = 0; i < parsedData.rows.length; i++) {
      const raw = parsedData.rows[i];
      try {
        const startAtRaw = raw.start_at;
        const endAtRaw = raw.end_at;
        
        // Parse dates using Postgres RPC
        let startAtParsed: string | null = null;
        let endAtParsed: string | null = null;
        
        if (startAtRaw && endAtRaw) {
          const { data: parsed, error: parseErr } = await adminSupabase
            .rpc('normalise_booking_times', {
              p_start: startAtRaw,
              p_end: endAtRaw,
              p_tz: tz
            });
          
          if (!parseErr && parsed && parsed.length > 0) {
            startAtParsed = parsed[0].start_utc || null;
            endAtParsed = parsed[0].end_utc || null;
          }
        }

        if (!startAtParsed || !endAtParsed) {
          errors.push({ rowIndex: i + 1, reason: "Invalid dates", rowData: raw });
          errorCount++;
          continue;
        }

        const dedupe_key = makeImportDedupeKey({
          source: raw.source,
          reference: raw.reference,
          vehicle_reg: raw.vehicle_reg,
          start_utc: startAtParsed
        });

        // Check for existing booking
        const { data: existing } = await adminSupabase
          .from("bookings")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("dedupe_key", dedupe_key)
          .maybeSingle();

        if (existing) {
          // Update existing
          const { error: updateErr } = await adminSupabase
            .from("bookings")
            .update({
              customer_name: raw.customer_name,
              start_at: startAtParsed,
              end_at: endAtParsed,
              plate: raw.vehicle_reg || null,
              car_color: raw.vehicle_colour || null,
              car_make: raw.vehicle_make || null,
              car_model: raw.vehicle_model || null,
              money_charged: raw.price || 0,
              money_received: raw.money_received || 0,
              notes: raw.notes || null,
            })
            .eq("id", existing.id);
          
          if (updateErr) {
            errors.push({ rowIndex: i + 1, reason: updateErr.message, rowData: raw });
            errorCount++;
          } else {
            successCount++;
          }
        } else {
          // Insert new
          const { error: insertErr } = await adminSupabase
            .from("bookings")
            .insert({
              tenant_id: tenantId,
              source: "aph",
              reference: raw.reference,
              customer_name: raw.customer_name,
              start_at: startAtParsed,
              end_at: endAtParsed,
              plate: raw.vehicle_reg || null,
              car_color: raw.vehicle_colour || null,
              car_make: raw.vehicle_make || null,
              car_model: raw.vehicle_model || null,
              money_charged: raw.price || 0,
              money_received: raw.money_received || 0,
              notes: raw.notes || null,
              dedupe_key,
              status: raw.status || "reserved",
            });
          
          if (insertErr) {
            errors.push({ rowIndex: i + 1, reason: insertErr.message, rowData: raw });
            errorCount++;
          } else {
            successCount++;
          }
        }
      } catch (rowErr: any) {
        errors.push({ rowIndex: i + 1, reason: rowErr.message, rowData: raw });
        errorCount++;
      }
    }

    // Update import run with results
    await adminSupabase
      .from("import_runs")
      .update({ 
        inserted_count: successCount, 
        error_count: errorCount 
      })
      .eq("id", run.id);

    const importResult = {
      runId: run.id,
      successCount,
      errorCount,
      errors,
    };

    if (importResult.errorCount > 0 && successCount === 0) {
      console.error(`[parse-file] Import failed: all rows had errors`);
      await supabase
        .from("ingest_email_files")
        .update({ 
          parse_status: "failed", 
          parse_error: `Import failed: ${importResult.errorCount} errors, 0 successes` 
        })
        .eq("id", fileId);
      
      return NextResponse.json({ 
        error: `Import failed: ${importResult.errorCount} errors`,
        importResult,
      }, { status: 500 });
    }

    // 6. Update file status to parsed
    await supabase
      .from("ingest_email_files")
      .update({ 
        parse_status: "parsed",
        parsed_at: new Date().toISOString(),
      })
      .eq("id", fileId);

    // Import run already has meta set when created

    return NextResponse.json({
      ok: true,
      fileId: file.id,
      filename: file.filename,
      rowsParsed: parsedData.rows.length,
      importResult: {
        runId: importResult.runId,
        successCount: importResult.successCount,
        errorCount: importResult.errorCount,
        errors: importResult.errors?.slice(0, 10), // First 10 errors
      },
    });
  } catch (err: any) {
    console.error(`[parse-file] Error:`, err);
    return NextResponse.json(
      { error: err?.message || "unknown error" },
      { status: 500 }
    );
  }
}
