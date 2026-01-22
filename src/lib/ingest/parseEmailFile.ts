import { getServiceSupabase } from "@/lib/supabase/service";
import { supabaseAdmin } from "@/lib/supabase/server";
import { makeImportDedupeKey } from "@/lib/bookings/dedupe";

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

export async function parseEmailFile(fileId: string, tenantId: string) {
  console.log(`[parseEmailFile] Starting parse for file ${fileId}, tenant ${tenantId}`);
  const supabase = getServiceSupabase();

  // 1. Get file record
  const { data: file, error: fileError } = await supabase
    .from("ingest_email_files")
    .select("*, ingest_emails(*)")
    .eq("id", fileId)
    .single();

  if (fileError || !file) {
    console.error(`[parseEmailFile] File not found:`, fileError);
    throw new Error("File not found");
  }

  if (file.parse_status === "parsed") {
    console.log(`[parseEmailFile] File already parsed: ${fileId}`);
    return { ok: true, message: "File already parsed", fileId: file.id };
  }
  
  console.log(`[parseEmailFile] File status: ${file.parse_status}, filename: ${file.filename}`);

  // 2. Download file from Storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from(file.storage_bucket)
    .download(file.storage_path);

  if (downloadError || !fileData) {
    await supabase
      .from("ingest_email_files")
      .update({ 
        parse_status: "failed", 
        parse_error: `Download failed: ${downloadError?.message || "unknown"}` 
      })
      .eq("id", fileId);
    throw new Error(`Download failed: ${downloadError?.message}`);
  }

  // 3. Convert to Buffer
  const arrayBuffer = await fileData.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  console.log(`[parseEmailFile] File downloaded: ${buffer.length} bytes`);

  // 4. Parse file
  let parsedData;
  try {
    if (file.filename.toLowerCase().endsWith('.txt') || file.filename.toLowerCase().includes('aph')) {
      console.log(`[parseEmailFile] Parsing APH file...`);
      parsedData = parseAphTxtFile(buffer);
      console.log(`[parseEmailFile] Parsed ${parsedData.rows.length} rows`);
    } else {
      throw new Error(`Unsupported file type: ${file.filename}`);
    }
  } catch (parseErr: any) {
    console.error(`[parseEmailFile] Parse error:`, parseErr);
    await supabase
      .from("ingest_email_files")
      .update({ 
        parse_status: "failed", 
        parse_error: `Parse failed: ${parseErr.message}` 
      })
      .eq("id", fileId);
    throw parseErr;
  }

  if (!parsedData.rows || parsedData.rows.length === 0) {
    console.error(`[parseEmailFile] No valid rows found`);
    await supabase
      .from("ingest_email_files")
      .update({ 
        parse_status: "failed", 
        parse_error: "No valid rows found in file" 
      })
      .eq("id", fileId);
    throw new Error("No valid rows found in file");
  }

  // 5. Import bookings
  console.log(`[parseEmailFile] Starting import for ${parsedData.rows.length} rows, tenant ${tenantId}`);
  const adminSupabase = supabaseAdmin();
  
  // Create import run
  const { data: run, error: runErr } = await adminSupabase
    .from("import_runs")
    .insert({ 
      tenant_id: tenantId, 
      profile_name: `Email import: ${file.filename}`,
    })
    .select("id")
    .single();
  
  if (runErr || !run) {
    console.error(`[parseEmailFile] Failed to create import run:`, runErr);
    throw new Error(`Failed to create import run: ${runErr?.message}`);
  }
  
  console.log(`[parseEmailFile] Created import run: ${run.id}`);

  // Process rows
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

  // Update file status to parsed
  console.log(`[parseEmailFile] Updating file status to parsed: ${fileId}`);
  const { error: updateError } = await supabase
    .from("ingest_email_files")
    .update({ 
      parse_status: "parsed",
      parsed_at: new Date().toISOString(),
    })
    .eq("id", fileId);
  
  if (updateError) {
    console.error(`[parseEmailFile] Failed to update file status:`, updateError);
  } else {
    console.log(`[parseEmailFile] ✅ File status updated to parsed`);
  }

  return {
    ok: true,
    fileId: file.id,
    filename: file.filename,
    rowsParsed: parsedData.rows.length,
    importResult: {
      runId: run.id,
      successCount,
      errorCount,
      errors: errors.slice(0, 10),
    },
  };
}
