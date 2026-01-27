import { getServiceSupabase } from "@/lib/supabase/service";
import { supabaseAdmin } from "@/lib/supabase/server";
import { makeImportDedupeKey } from "@/lib/bookings/dedupe";
import { mapAphCsvLike, detectAndMapFromAttachment } from "@/lib/importers/canonical/mappers";
import { isImageFile } from "@/lib/ingest/fileTypeUtils";

/**
 * Parse file using canonical mappers (supports APH, CAVU, etc.)
 */
function parseFileWithCanonicalMappers(buffer: Buffer, filename: string) {
  const text = buffer.toString("utf-8");
  
  // Use canonical mapper to detect and parse
  const canonicalBookings = detectAndMapFromAttachment(filename, text);
  
  if (!canonicalBookings || canonicalBookings.length === 0) {
    throw new Error(`Could not detect format for file: ${filename}`);
  }

  // Convert canonical format to internal row format
  const parsedRows = canonicalBookings.map((canonical) => {
    // Extract external_status from raw data if available (Holiday Extras stores it there)
    const external_status = canonical.raw?.external_status || null;
    
    return {
      channel: canonical.channel, // Keep original channel (CAVU, APH, FLYPARKS_EMAIL, HOLIDAY_EXTRAS) for source mapping
      source: canonical.channel.toLowerCase(), // For dedupe key
      reference: canonical.booking_reference,
      customer_name: canonical.customer_firstname && canonical.customer_lastname
        ? `${canonical.customer_firstname} ${canonical.customer_lastname}`.trim()
        : canonical.customer_lastname || canonical.customer_firstname || null,
      customer_lastname: canonical.customer_lastname,
      customer_title: null,
      customer_firstname: canonical.customer_firstname,
      start_at: canonical.start_at,
      end_at: canonical.end_at,
      vehicle_reg: canonical.vehicle_registration,
      vehicle_colour: canonical.vehicle_colour,
      vehicle_make: canonical.vehicle_make,
      vehicle_model: canonical.vehicle_model,
      flight_number: canonical.return_flight_number || canonical.outbound_flight_number,
      phone: canonical.customer_phone,
      status: "reserved",
      price: canonical.total_price || 0,
      money_received: 0,
      notes: null,
      // Additional fields
      external_reference: canonical.third_party_reference || canonical.booking_reference,
      external_status: external_status,
      return_flight_no: canonical.return_flight_number,
      product_code: null,
      currency: canonical.currency || "GBP",
      total_price: canonical.total_price,
      raw_fields: canonical.raw,
    };
  });

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

  // If already parsed, reset status to allow re-parsing (for retry scenarios)
  if (file.parse_status === "parsed") {
    console.log(`[parseEmailFile] File already parsed, resetting status for retry: ${fileId}`);
    const { error: resetError } = await supabase
      .from("ingest_email_files")
      .update({ 
        parse_status: "pending",
        parsed_at: null,
        parse_error: null,
      })
      .eq("id", fileId);
    
    if (resetError) {
      console.error(`[parseEmailFile] Failed to reset status:`, resetError);
    } else {
      console.log(`[parseEmailFile] ✅ Status reset to pending for retry`);
    }
  }
  
  console.log(`[parseEmailFile] File status: ${file.parse_status}, filename: ${file.filename}`);

  // 1.5. Check if file is an image (non-booking attachment) - skip it
  if (isImageFile(file.filename, file.content_type)) {
    console.log(`[parseEmailFile] Skipping image file: ${file.filename}`);
    await supabase
      .from("ingest_email_files")
      .update({ 
        parse_outcome: "skipped",
        parse_status: "parsed", // Mark as parsed so it doesn't show as pending
        parse_reason: "non_booking_attachment:image",
        parsed_at: new Date().toISOString(),
        parse_error: null,
      })
      .eq("id", fileId);
    
    return {
      ok: true,
      fileId: file.id,
      filename: file.filename,
      rowsParsed: 0,
      stagedCount: 0,
      importResult: {
        runId: null,
        successCount: 0,
        errorCount: 0,
        errors: [],
      },
    };
  }

  // 2. Download file from Storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from(file.storage_bucket)
    .download(file.storage_path);

  if (downloadError || !fileData) {
    const errorMsg = downloadError?.message || "unknown";
    await supabase
      .from("ingest_email_files")
      .update({ 
        parse_outcome: "failed",
        parse_status: "failed", 
        parse_error: `Download failed: ${errorMsg}`,
        parse_reason: `exception:${errorMsg.substring(0, 200)}`,
      })
      .eq("id", fileId);
    throw new Error(`Download failed: ${errorMsg}`);
  }

  // 3. Convert to Buffer
  const arrayBuffer = await fileData.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  console.log(`[parseEmailFile] File downloaded: ${buffer.length} bytes`);

  // 4. Parse file using canonical mappers
  let parsedData;
  try {
    console.log(`[parseEmailFile] Parsing file with canonical mappers: ${file.filename}`);
    parsedData = parseFileWithCanonicalMappers(buffer, file.filename);
    console.log(`[parseEmailFile] Parsed ${parsedData.rows.length} rows from ${file.filename}`);
    
    // Log first few rows for debugging
    if (parsedData.rows.length > 0) {
      console.log(`[parseEmailFile] Sample row:`, {
        reference: parsedData.rows[0].reference,
        channel: (parsedData.rows[0] as any).channel,
        start_at: parsedData.rows[0].start_at,
        vehicle_reg: parsedData.rows[0].vehicle_reg,
      });
    }
  } catch (parseErr: any) {
    console.error(`[parseEmailFile] Parse error:`, parseErr);
    
    // Determine parse_reason based on error type
    let parseReason: string | null = null;
    if (parseErr.message?.includes("Could not detect format")) {
      parseReason = "format_not_detected";
    } else {
      // For other exceptions, use "exception:<message>" (truncated to 200 chars)
      const errorMsg = parseErr.message || "unknown error";
      parseReason = `exception:${errorMsg.substring(0, 200)}`;
    }
    
    await supabase
      .from("ingest_email_files")
      .update({ 
        parse_outcome: "failed",
        parse_status: "failed", 
        parse_error: `Parse failed: ${parseErr.message}`,
        parse_reason: parseReason,
      })
      .eq("id", fileId);
    throw parseErr;
  }

  if (!parsedData.rows || parsedData.rows.length === 0) {
    console.error(`[parseEmailFile] No valid rows found - file format detected but extracted 0 rows`);
    await supabase
      .from("ingest_email_files")
      .update({ 
        parse_outcome: "failed",
        parse_status: "failed", 
        parse_error: "File format detected but no valid rows extracted. File may be empty or have no data rows.",
        parse_reason: "no_rows_extracted",
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
    // Determine source based on detected channel
    const channel = (raw as any).channel || "APH";
    let sourceValue: string;
    let externalSourceLabel: string;
    
    if (channel === "CAVU") {
      sourceValue = "cavu"; // Valid enum value
      externalSourceLabel = "CAVU Email Import";
    } else if (channel === "HOLIDAY_EXTRAS") {
      sourceValue = "holidayextras"; // Valid enum value (no underscore)
      externalSourceLabel = "Holiday Extras Email Import";
    } else if (channel === "FLYPARKS_EMAIL") {
      sourceValue = "other"; // Valid enum value
      externalSourceLabel = "Flyparks Email Import";
    } else {
      // Default to APH
      sourceValue = "other"; // Valid enum value
      externalSourceLabel = "APH Email Import";
    }

    // Generate dedupe_key (required by staging table)
    // Use the start_at as-is for now, it will be normalized later when promoting to bookings
    // Provide fallbacks for required fields
    const dedupe_key = makeImportDedupeKey({
      source: raw.source || channel.toLowerCase(),
      reference: raw.reference || raw.external_reference || "UNKNOWN",
      vehicle_reg: raw.vehicle_reg || "UNKNOWN",
      start_utc: raw.start_at || new Date().toISOString(), // Fallback to now if missing
    });

    return {
      tenant_id: tenantId,
      source: sourceValue,
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
      customer_firstname: raw.customer_firstname,
      customer_lastname: raw.customer_lastname,
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
      dedupe_key: dedupe_key, // Required field
      // Store raw data for debugging
      raw_json: {
        mapping: channel === "CAVU" ? "cavuV1" : channel === "FLYPARKS_EMAIL" ? "flyparksV1" : "aphV1",
        channel: channel,
        raw_fields: raw.raw_fields || [],
        external_reference: raw.external_reference,
        external_status: raw.external_status,
      },
    };
  });

  // Insert into staging (handle duplicates gracefully)
  let stagedData: any[] = [];
  
  if (stagingInserts.length === 0) {
    console.warn(`[parseEmailFile] ⚠️ No staging inserts to process - parsedData.rows was empty`);
    // Still mark as parsed if format was detected, but log the issue
    await supabase
      .from("ingest_email_files")
      .update({ 
        parse_outcome: "parsed",
        parse_status: "parsed",
        parsed_at: new Date().toISOString(),
        parse_error: "File format detected but no valid rows extracted"
      })
      .eq("id", fileId);
    return {
      ok: true,
      fileId: file.id,
      filename: file.filename,
      rowsParsed: 0,
      stagedCount: 0,
      importResult: {
        runId: null,
        successCount: 0,
        errorCount: 0,
        errors: [{ rowIndex: 0, reason: "No valid rows extracted from file", rowData: null }],
      },
    };
  }
  
  console.log(`[parseEmailFile] Preparing to insert ${stagingInserts.length} rows into staging`);
  const { data: insertedData, error: stagingError } = await adminSupabase
    .from("booking_import_staging")
    .insert(stagingInserts)
    .select("id, external_reference");

  if (stagingError) {
    // Check if it's a duplicate key error
    const isDuplicate = stagingError.code === '23505' || 
                       stagingError.message?.includes('duplicate key') ||
                       stagingError.message?.includes('unique constraint');
    
    if (isDuplicate) {
      console.log(`[parseEmailFile] ⚠️ Duplicate detected - booking already in staging, fetching existing records...`);
      // Fetch existing records by dedupe_key to continue processing
      const dedupeKeys = stagingInserts.map(s => s.dedupe_key);
      const { data: existing } = await adminSupabase
        .from("booking_import_staging")
        .select("id, external_reference, dedupe_key")
        .in("dedupe_key", dedupeKeys);
      
      stagedData = existing || [];
      console.log(`[parseEmailFile] Found ${stagedData.length} existing staging records, continuing with booking promotion...`);
    } else {
      console.error(`[parseEmailFile] Staging insert failed:`, stagingError);
      // Update file status with error
      const errorMsg = stagingError.message || "unknown error";
      await supabase
        .from("ingest_email_files")
        .update({ 
          parse_outcome: "failed",
          parse_status: "failed", 
          parse_error: `Staging insert failed: ${errorMsg}`,
          parse_reason: `exception:${errorMsg.substring(0, 200)}`,
        })
        .eq("id", fileId);
      throw new Error(`Staging insert failed: ${errorMsg}`);
    }
  } else {
    stagedData = insertedData || [];
    console.log(`[parseEmailFile] ✅ Inserted ${stagedData.length} rows into staging`);
  }

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
        console.log(`[parseEmailFile] ⚠️ Skipping row ${i + 1}: Missing dates`, {
          start_at: startAtRaw,
          end_at: endAtRaw,
          reference: raw.reference,
          channel: (raw as any).channel,
          raw_data: raw,
        });
        errors.push({ rowIndex: i + 1, reason: `Missing dates (start: ${startAtRaw}, end: ${endAtRaw})`, rowData: raw });
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
        reference: raw.reference || raw.external_reference || "UNKNOWN",
        vehicle_reg: raw.vehicle_reg || "UNKNOWN",
        start_utc: startAtParsed
      });

      // Check for existing booking (by dedupe_key)
      const { data: existing } = await adminSupabase
        .from("bookings")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("dedupe_key", dedupe_key)
        .maybeSingle();
      
      // Also check by reference + vehicle + dates as fallback
      let existingByRef = null;
      if (!existing && raw.reference && raw.vehicle_reg && startAtParsed) {
        const { data: refMatch } = await adminSupabase
          .from("bookings")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("reference", raw.reference)
          .eq("plate", raw.vehicle_reg)
          .eq("start_at", startAtParsed)
          .maybeSingle();
        existingByRef = refMatch;
      }
      
      const existingBooking = existing || existingByRef;

      if (existingBooking) {
        // Update existing booking
        console.log(`[parseEmailFile] Updating existing booking: ${existingBooking.id}`);
        const { error: updateErr } = await adminSupabase
          .from("bookings")
          .update({
            customer_name: raw.customer_name,
            customer_phone: raw.phone || null,
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
          .eq("id", existingBooking.id);
        
        if (updateErr) {
          errors.push({ rowIndex: i + 1, reason: updateErr.message, rowData: raw });
          errorCount++;
        } else {
          successCount++;
        }
      } else {
        // Determine source and external_source based on channel
        const channel = (raw as any).channel || "APH";
        let bookingSource: "cavu" | "holidayextras" | "other";
        let externalSource: string;
        
        if (channel === "CAVU") {
          bookingSource = "cavu";
          externalSource = "CAVU Email Import";
        } else if (channel === "HOLIDAY_EXTRAS") {
          bookingSource = "holidayextras"; // Valid enum value (no underscore)
          externalSource = "Holiday Extras Email Import";
        } else if (channel === "FLYPARKS_EMAIL") {
          bookingSource = "other";
          externalSource = "Flyparks Email Import";
        } else {
          bookingSource = "other";
          externalSource = "APH Email Import";
        }

        // Skip if vehicle_reg is missing (required for bookings table)
        if (!raw.vehicle_reg || raw.vehicle_reg.trim() === "" || raw.vehicle_reg === "-") {
          console.log(`[parseEmailFile] ⚠️ Skipping row ${i + 1}: Missing vehicle registration`, {
            reference: raw.reference,
            channel: (raw as any).channel,
          });
          errors.push({ rowIndex: i + 1, reason: "Missing vehicle registration (required field)", rowData: raw });
          errorCount++;
          continue;
        }

        // Insert new
        const { error: insertErr } = await adminSupabase
          .from("bookings")
          .insert({
            tenant_id: tenantId,
            source: bookingSource, // Valid enum: 'direct', 'parkvia', 'holidayextras', 'manual', 'other', 'cavu', 'supplier_api'
            external_source: externalSource, // Store channel identifier here
            reference: raw.reference,
            customer_name: raw.customer_name,
            customer_email: "", // APH CSV doesn't provide email, use empty string (required field)
            customer_phone: raw.phone || null,
            start_at: startAtParsed,
            end_at: endAtParsed,
            plate: raw.vehicle_reg, // Already validated as non-null above
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
  console.log(`[parseEmailFile] Results summary:`, {
    rowsParsed: parsedData.rows.length,
    stagedCount: stagedData?.length || 0,
    successCount,
    errorCount,
  });
  
  const { error: updateError, data: updatedFile } = await supabase
    .from("ingest_email_files")
    .update({ 
      parse_outcome: "parsed",
      parse_status: "parsed",
      parsed_at: new Date().toISOString(),
      parse_error: null, // Clear any previous errors
      parse_reason: null, // Clear any previous reason
    })
    .eq("id", fileId)
    .select("id, parse_status, parsed_at")
    .single();
  
  if (updateError) {
    console.error(`[parseEmailFile] ❌ Failed to update file status:`, updateError);
  } else {
    console.log(`[parseEmailFile] ✅ File status updated to parsed:`, {
      fileId: updatedFile?.id,
      parse_status: updatedFile?.parse_status,
      parsed_at: updatedFile?.parsed_at,
    });
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
