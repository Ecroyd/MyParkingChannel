import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { simpleParser } from "mailparser";
import { detectAndMapFromAttachment, mapFlyparksEmailText } from "@/lib/importers/canonical/mappers";
import { getParsableBodyForDirectBooking } from "@/lib/email/forwarded";
import type { CanonicalBooking } from "@/lib/importers/canonical/types";
import { isImageFile } from "@/lib/ingest/fileTypeUtils";

export const runtime = "nodejs";

const EMAIL_PROCESS_SECRET = process.env.EMAIL_PROCESS_SECRET || process.env.INGEST_SECRET;

function b64ToBuffer(b64: string) {
  return Buffer.from(b64, "base64");
}

/**
 * Map canonical booking to staging table format
 */
function mapToStagingRow(canonical: CanonicalBooking, tenantId: string, emailId: string, filename: string | null) {
  return {
    tenant_id: tenantId,
    source: canonical.channel.toLowerCase().replace("_", ""), // "cavu", "aph", "flyparksemail"
    source_email_id: emailId,
    source_filename: filename,
    // Map canonical fields to staging columns
    reference: canonical.booking_reference,
    external_reference: canonical.third_party_reference || canonical.booking_reference,
    start_at: canonical.start_at,
    end_at: canonical.end_at,
    vehicle_reg: canonical.vehicle_registration,
    vehicle_make: canonical.vehicle_make,
    vehicle_model: canonical.vehicle_model,
    vehicle_colour: canonical.vehicle_colour,
    customer_firstname: canonical.customer_firstname,
    customer_lastname: canonical.customer_lastname,
    customer_name: canonical.customer_firstname && canonical.customer_lastname
      ? `${canonical.customer_firstname} ${canonical.customer_lastname}`.trim()
      : canonical.customer_lastname || canonical.customer_firstname || null,
    phone: canonical.customer_phone,
    flight_number: canonical.return_flight_number || canonical.outbound_flight_number,
    return_flight_no: canonical.return_flight_number,
    total_price: canonical.total_price,
    price: canonical.total_price || 0, // For compatibility
    currency: canonical.currency || "GBP",
    status: "reserved", // Default
    money_received: 0,
    notes: null,
    raw_json: canonical.raw || {},
  };
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-email-process-secret");
  if (!EMAIL_PROCESS_SECRET || secret !== EMAIL_PROCESS_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { email_ingest_id, tenant_id } = await req.json();

  if (!email_ingest_id || !tenant_id) {
    return NextResponse.json({ ok: false, error: "email_ingest_id and tenant_id required" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  // 1) Fetch ingest_emails row (note: using ingest_emails, not email_ingest)
  const { data: emailRow, error: emailErr } = await supabase
    .from("ingest_emails")
    .select("*")
    .eq("id", email_ingest_id)
    .single();

  if (emailErr || !emailRow) {
    return NextResponse.json({ ok: false, error: emailErr?.message || "email not found" }, { status: 404 });
  }

  // 2) Parse MIME
  const rawBuf = b64ToBuffer(emailRow.raw_rfc822_base64);
  const parsed = await simpleParser(rawBuf);

  const mapped: CanonicalBooking[] = [];

  // 3) Upload attachments + map
  if (parsed.attachments?.length) {
    for (const att of parsed.attachments) {
      const filename = att.filename || `attachment-${Date.now()}`;
      const storagePath = `${tenant_id}/${email_ingest_id}/${Date.now()}-${filename}`;

      // Upload to bucket
      const up = await supabase.storage
        .from("email-imports")
        .upload(storagePath, att.content, { 
          contentType: att.contentType || "application/octet-stream", 
          upsert: true 
        });

      if (up.error) {
        console.error(`[email-process] Upload failed for ${filename}:`, up.error);
        continue; // Skip this attachment but continue with others
      }

      // Check if file is an image (non-booking attachment)
      const isImage = isImageFile(filename, att.contentType);
      
      // Also create file record in ingest_email_files
      await supabase.from("ingest_email_files").insert({
        email_id: email_ingest_id,
        filename: filename,
        content_type: att.contentType || null,
        storage_bucket: "email-imports",
        storage_path: storagePath,
        parse_status: isImage ? "parsed" : "pending", // Mark images as parsed immediately
        parse_outcome: isImage ? "skipped" : null,
        parse_reason: isImage ? "non_booking_attachment:image" : null,
      });

      // Skip parsing if it's an image
      if (isImage) {
        console.log(`[email-process] Skipped image file: ${filename}`);
        continue;
      }

      // Try parse text attachments
      const isTexty =
        att.contentType?.startsWith("text/") ||
        filename.toLowerCase().endsWith(".csv") ||
        filename.toLowerCase().endsWith(".txt");

      if (isTexty) {
        const text = att.content.toString("utf-8");
        const m = detectAndMapFromAttachment(filename, text);
        if (m) {
          mapped.push(...m);
        }
      }
    }
  }

  // 4) If no attachments mapped, try mapping from email text itself (Flyparks style)
  const parsableBodyText = getParsableBodyForDirectBooking({
    subject: parsed.subject ?? undefined,
    text: parsed.text ?? "",
    html: parsed.html ?? undefined,
  });
  const looksLikeOnlySignatureOrQr =
    !parsableBodyText ||
    parsableBodyText.length < 80 ||
    (/qr code/i.test(parsableBodyText) &&
      !/booking|vehicle|registration|arrival|departure|date|time/i.test(parsableBodyText));
  if (
    mapped.length === 0 &&
    !looksLikeOnlySignatureOrQr &&
    (parsableBodyText.includes("Booking Confirmation") || parsableBodyText.includes("Departure date"))
  ) {
    mapped.push(...mapFlyparksEmailText(parsableBodyText));
  }

  // 5) Insert mapped rows into staging
  if (mapped.length > 0) {
    const stagingRows = mapped.map((b) => mapToStagingRow(b, tenant_id, email_ingest_id, null));
    
    const { data: inserted, error: insertErr } = await supabase
      .from("booking_import_staging")
      .insert(stagingRows)
      .select("id, reference");

    if (insertErr) {
      console.error(`[email-process] Staging insert failed:`, insertErr);
      return NextResponse.json({ 
        ok: false, 
        error: `Staging insert failed: ${insertErr.message}`,
        mapped_count: mapped.length 
      }, { status: 500 });
    }

    console.log(`[email-process] ✅ Inserted ${inserted?.length || 0} rows into staging`);
  }

  return NextResponse.json({
    ok: true,
    email_ingest_id,
    attachments: parsed.attachments?.length || 0,
    mapped_count: mapped.length,
  });
}
