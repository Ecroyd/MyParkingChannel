import { getServiceSupabase } from "@/lib/supabase/service";
import { supabaseAdmin } from "@/lib/supabase/server";
import { makeImportDedupeKey } from "@/lib/bookings/dedupe";
import { parse } from "csv-parse/sync";
import { parseAphRow } from "@/lib/importers/aph/parseAphRow";

/**
 * Parse APH CSV file (33-column, quoted, positional CSV with no headers)
 */
function parseAphCsvFile(buffer: Buffer) {
  const text = buffer.toString("utf-8");
  
  // Parse CSV rows (no headers, quoted fields, relax column count)
  const rows: string[][] = parse(text, {
    relax_quotes: true,
    relax_column_count: true,
    trim: false,
    skip_empty_lines: true,
    bom: true, // Handle BOM if present
  });

  const parsedRows: any[] = [];

  for (const row of rows) {
    try {
      const parsed = parseAphRow(row);
      
      // Skip if missing essential fields
      if (!parsed.external_reference || !parsed.customer_last_name) {
        console.log(`[parseAphCsvFile] Skipping row: missing reference or last name`);
        continue;
      }

      parsedRows.push({
        source: "aph",
        reference: parsed.external_reference,
        customer_name: parsed.customer_name,
        customer_lastname: parsed.customer_last_name,
        customer_title: parsed.customer_title,
        customer_firstname: parsed.customer_first_name,
        start_at: parsed.start_at,
        end_at: parsed.end_at,
        vehicle_reg: parsed.vehicle_reg,
        vehicle_colour: parsed.vehicle_colour,
        vehicle_make: parsed.vehicle_make,
        vehicle_model: null, // APH doesn't provide model
        flight_number: parsed.return_flight_no,
        phone: parsed.customer_phone,
        status: parsed.external_status || "reserved",
        price: parsed.total_price || 0,
        money_received: 0, // APH doesn't provide this in the CSV
        notes: null,
        // APH-specific fields for staging
        external_reference: parsed.external_reference,
        external_status: parsed.external_status,
        return_flight_no: parsed.return_flight_no,
        product_code: parsed.product_code,
        currency: parsed.currency,
        total_price: parsed.total_price,
        raw_fields: parsed.raw_fields,
      });
    } catch (err: any) {
      console.error(`[parseAphCsvFile] Error parsing row:`, err);
      continue;
    }
  }

  return { headers: [], rows: parsedRows };
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
      console.log(`[parseEmailFile] Parsing APH CSV file...`);
      parsedData = parseAphCsvFile(buffer);
      console.log(`[parseEmailFile] Parsed ${parsedData.rows.length} rows from APH CSV`);
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

  // 5. Insert into staging table (APH-specific format)
  console.log(`[parseEmailFile] Inserting ${parsedData.rows.length} rows into staging, tenant ${tenantId}`);
  const adminSupabase = supabaseAdmin();
  
  const email = (file as any).ingest_emails;
  const emailId = email?.id || null;

  // Prepare staging inserts
  const stagingInserts = parsedData.rows.map((raw) => {
    return {
      tenant_id: tenantId,
      source: "aph_email",
      source_email_id: emailId,
      source_filename: file.filename,
      // Map to existing staging columns
      reference: raw.external_reference || raw.reference,
      external_reference: raw.external_reference,
      external_status: raw.external_status,
      start_at: raw.start_at,
      end_at: raw.end_at,
      vehicle_reg: raw.vehicle_reg,
      vehicle_make: raw.vehicle_make,
      vehicle_colour: raw.vehicle_colour,
      vehicle_model: raw.vehicle_model,
      customer_title: raw.customer_title,
      customer_first_name: raw.customer_firstname,
      customer_last_name: raw.customer_lastname,
      customer_name: raw.customer_name,
      phone: raw.phone,
      flight_number: raw.flight_number,
      return_flight_no: raw.return_flight_no,
      product_code: raw.product_code,
      currency: raw.currency || "GBP",
      total_price: raw.total_price,
      price: raw.price || raw.total_price || 0, // For compatibility
      status: raw.status || raw.external_status || "reserved",
      money_received: raw.money_received || 0,
      notes: null,
      // Store raw data for debugging
      raw_json: {
        mapping: "aphV1",
        raw_fields: raw.raw_fields || [],
        external_reference: raw.external_reference,
        external_status: raw.external_status,
      },
    };
  });

  // Insert into staging
  const { data: stagedData, error: stagingError } = await adminSupabase
    .from("booking_import_staging")
    .insert(stagingInserts)
    .select("id, external_reference");

  if (stagingError) {
    console.error(`[parseEmailFile] Staging insert failed:`, stagingError);
    throw new Error(`Staging insert failed: ${stagingError.message}`);
  }

  console.log(`[parseEmailFile] ✅ Inserted ${stagedData?.length || 0} rows into staging`);

  // 6. Auto-promote from staging to bookings (optional - you can remove this to require manual finalize)
  // For now, we'll auto-promote to match existing behavior
  let successCount = 0;
  let errorCount = 0;
  const errors: any[] = [];
  const tz = 'Europe/London';

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
    // Don't fail - staging is done, import run is optional
  } else {
    console.log(`[parseEmailFile] Created import run: ${run.id}`);
  }

  // Process staging rows and promote to bookings
  for (let i = 0; i < parsedData.rows.length; i++) {
    const raw = parsedData.rows[i];
    try {
      const startAtRaw = raw.start_at;
      const endAtRaw = raw.end_at;
      
      if (!startAtRaw || !endAtRaw) {
        errors.push({ rowIndex: i + 1, reason: "Missing dates", rowData: raw });
        errorCount++;
        continue;
      }

      // Parse dates using Postgres RPC
      let startAtParsed: string | null = null;
      let endAtParsed: string | null = null;
      
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

      if (!startAtParsed || !endAtParsed) {
        errors.push({ rowIndex: i + 1, reason: "Invalid dates", rowData: raw });
        errorCount++;
        continue;
      }

      const dedupe_key = makeImportDedupeKey({
        source: raw.source || "aph",
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
            money_charged: raw.price || raw.total_price || 0,
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
            money_charged: raw.price || raw.total_price || 0,
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
  if (run) {
    await adminSupabase
      .from("import_runs")
      .update({ 
        inserted_count: successCount, 
        error_count: errorCount 
      })
      .eq("id", run.id);
  }

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
    stagedCount: stagedData?.length || 0,
    importResult: {
      runId: run?.id || null,
      successCount,
      errorCount,
      errors: errors.slice(0, 10),
    },
  };
}
