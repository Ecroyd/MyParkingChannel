import { getServiceSupabase } from "@/lib/supabase/service";
import { supabaseAdmin } from "@/lib/supabase/server";
import { makeImportDedupeKey } from "@/lib/bookings/dedupe";
import { mapAphCsvLike, detectAndMapFromAttachment } from "@/lib/importers/canonical/mappers";
import { isImageFile } from "@/lib/ingest/fileTypeUtils";
import { channelToParserKey, getAttribution, type ParserKey } from "@/lib/importAttribution";

/**
 * Parse file using canonical mappers (supports APH, CAVU, etc.)
 * Returns { rows, detectedFormat } so EXT1 TSV with 0 rows can set parse_outcome = 'empty'.
 */
function parseFileWithCanonicalMappers(buffer: Buffer, filename: string): { rows: any[]; detectedFormat: string | null } {
  const text = buffer.toString("utf-8");
  const result = detectAndMapFromAttachment(filename, text);

  if (!result) {
    throw new Error(`Could not detect format for file: ${filename}`);
  }

  const { bookings: canonicalBookings, format: detectedFormat } = result;

  // Holiday Extras detected but 0 rows → return empty so caller can set parse_outcome = 'empty'
  if (canonicalBookings.length === 0 && detectedFormat === "HOLIDAY_EXTRAS") {
    return { rows: [], detectedFormat: "HOLIDAY_EXTRAS" };
  }

  if (canonicalBookings.length === 0) {
    throw new Error(`Could not detect format for file: ${filename}`);
  }

  // Convert canonical format to internal row format
  const parsedRows = canonicalBookings.map((canonical) => {
    // Extract external_status from raw data (APH/Holiday Extras store it there)
    const external_status = canonical.raw?.external_status != null
      ? String(canonical.raw.external_status).trim()
      : null;
    // CANX (from *CANX*) and cancel* both map to cancelled
    const isCancel =
      external_status != null &&
      (/cancel/i.test(external_status) || external_status.toUpperCase().trim() === "CANX");
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
      status: isCancel ? "cancelled" : "reserved",
      price: canonical.money_charged ?? canonical.total_price ?? 0,
      money_received: canonical.money_received ?? 0,
      notes: null,
      // Additional fields
      external_reference: canonical.third_party_reference || canonical.booking_reference,
      external_status, // Keep raw token (e.g. "CANX") for audit; status is "cancelled" when isCancel
      return_flight_no: canonical.return_flight_number,
      product_code: null,
      currency: canonical.currency || "GBP",
      total_price: canonical.total_price,
      raw_fields: canonical.raw ?? {},
    };
  });

  return { headers: [], rows: parsedRows, detectedFormat };
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

  // Type guard for file with parse_outcome
  const fileWithOutcome = file as typeof file & { parse_outcome?: string | null };

  // 1.5. Check if file is an image (non-booking attachment) - skip it FIRST
  // This prevents images from being re-parsed
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

  // If already parsed and skipped, don't re-parse
  if (fileWithOutcome.parse_status === "parsed" && fileWithOutcome.parse_outcome === "skipped") {
    console.log(`[parseEmailFile] File already skipped, not re-parsing: ${fileId}`);
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

  // If already parsed, reset status to allow re-parsing (for retry scenarios)
  // BUT: Don't reset if it was skipped (images) or if parse_outcome is "skipped"
  if (fileWithOutcome.parse_status === "parsed" && fileWithOutcome.parse_outcome !== "skipped") {
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
  let winningParserKey: ParserKey = "unknown";
  try {
    console.log(`[parseEmailFile] Parsing file with canonical mappers: ${file.filename}`);
    parsedData = parseFileWithCanonicalMappers(buffer, file.filename);
    console.log(`[parseEmailFile] Parsed ${parsedData.rows.length} rows from ${file.filename}`);
    
    // Determine winning parser from the channel detected in parsed rows
    if (parsedData.rows.length > 0) {
      const detectedChannel = (parsedData.rows[0] as any).channel;
      winningParserKey = channelToParserKey(detectedChannel);
      console.log(`[parseEmailFile] Detected channel: ${detectedChannel}, parser key: ${winningParserKey}`);
      
      console.log(`[parseEmailFile] Sample row:`, {
        reference: parsedData.rows[0].reference,
        channel: detectedChannel,
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

  // EXT1 TSV detected but 0 data rows (format mismatch or empty file)
  if (parsedData.rows.length === 0 && parsedData.detectedFormat === "HOLIDAY_EXTRAS") {
    console.log(`[parseEmailFile] EXT1 TSV detected but 0 rows: ${file.filename}`);
    await supabase
      .from("ingest_email_files")
      .update({
        parse_outcome: "empty",
        parse_status: "parsed",
        parsed_at: new Date().toISOString(),
        parse_error: null,
        parse_reason: "No EXT1 rows detected (format mismatch or empty file)",
      })
      .eq("id", fileId);
    return {
      ok: true,
      fileId: file.id,
      filename: file.filename,
      rowsParsed: 0,
      stagedCount: 0,
      importResult: { runId: null, successCount: 0, errorCount: 0, errors: [], cancelledCount: 0 },
    };
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

  // 5. Create import run first so we can set run_id on staging rows
  const adminSupabase = supabaseAdmin();
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
  } else {
    console.log(`[parseEmailFile] Created import run: ${run.id}`);
  }

  // 6. Insert into staging table (with run_id for apply_import_run)
  console.log(`[parseEmailFile] Inserting ${parsedData.rows.length} rows into staging, tenant ${tenantId}`);
  const email = (file as any).ingest_emails;
  const emailId = email?.id || null;

  // Get attribution from winning parser (single source of truth)
  const attribution = getAttribution(winningParserKey);
  console.log(`[parseEmailFile] Using attribution:`, {
    parserKey: winningParserKey,
    bookingSource: attribution.bookingSource,
    externalSource: attribution.externalSource,
    detectedSource: attribution.detectedSource,
  });

  // Prepare staging inserts (run_id links to import_runs for apply_import_run RPC)
  const stagingInserts = parsedData.rows.map((raw) => {
    const channel = (raw as any).channel || "APH";

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
      run_id: run?.id ?? null,
      source: attribution.bookingSource, // Use attribution from parser
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
      // Store raw data for debugging (never null – required for cancellation detection)
      raw_json: {
        mapping: channel === "CAVU" ? "cavuV1" : channel === "FLYPARKS_EMAIL" ? "flyparksV1" : "aphV1",
        channel: channel,
        raw_fields: raw.raw_fields ?? [],
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

  // 7. Apply import run: upsert staging into bookings and apply cancellations (RPC)
  const errors: any[] = [];
  let upsertedCount = 0;
  let cancelledCount = 0;
  if (run?.id && stagedData.length > 0) {
    const { data: applyResult, error: applyErr } = await adminSupabase
      .rpc("apply_import_run", { p_run_id: run.id });
    if (applyErr) {
      console.error(`[parseEmailFile] apply_import_run failed:`, applyErr);
      errors.push({ rowIndex: 0, reason: applyErr.message, rowData: null });
    } else if (applyResult?.[0]) {
      upsertedCount = applyResult[0].upserted_count ?? 0;
      cancelledCount = applyResult[0].cancelled_count ?? 0;
      console.log(`[parseEmailFile] apply_import_run: upserted=${upsertedCount}, cancelled=${cancelledCount}`);
    }
  }

  // Update import run with RPC result counts
  if (run?.id) {
    await adminSupabase
      .from("import_runs")
      .update({
        inserted_count: upsertedCount,
        error_count: errors.length,
        meta: { cancelled_count: cancelledCount },
      })
      .eq("id", run.id);
  }

  const { error: updateError, data: updatedFile } = await supabase
    .from("ingest_email_files")
    .update({ 
      parse_outcome: "parsed",
      parse_status: "parsed",
      parsed_at: new Date().toISOString(),
      parse_error: null, // Clear any previous errors
      parse_reason: null, // Clear any previous reason
      // Set attribution fields (single source of truth)
      parser_key: winningParserKey,
      detected_source: attribution.detectedSource,
      external_source: attribution.externalSource,
      attribution_confidence: winningParserKey === "unknown" ? "fallback" : "parser",
    })
    .eq("id", fileId)
    .select("id, parse_status, parsed_at, parser_key, external_source")
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
      successCount: upsertedCount,
      errorCount: errors.length,
      cancelledCount,
      errors: errors.slice(0, 10),
    },
  };
}
