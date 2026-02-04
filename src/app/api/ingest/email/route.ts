import crypto from "crypto";
import { getServiceSupabase } from "@/lib/supabase/service";
// @ts-ignore - mailparser types may not be fully compatible
import { simpleParser } from "mailparser";
import { isImageFile } from "@/lib/ingest/fileTypeUtils";
import { getParsableBodyForDirectBooking } from "@/lib/email/forwarded";
import {
  extractFlyparksReceiptFromForward,
  guessFlyparksFields,
} from "@/lib/email/flyparksForward";

export const runtime = "nodejs";

// Map email addresses/domains to tenant IDs
// Set via environment variable: EMAIL_TENANT_MAP='{"from@example.com":"tenant-uuid","domain.com":"tenant-uuid"}'
// Or configure in code below
function getEmailTenantMap(): Record<string, string> {
  // Try environment variable first
  if (process.env.EMAIL_TENANT_MAP) {
    try {
      return JSON.parse(process.env.EMAIL_TENANT_MAP);
    } catch (e) {
      console.error("[ingest-email] Invalid EMAIL_TENANT_MAP JSON:", e);
    }
  }
  
  // Fallback to hardcoded map (you can configure this)
  return {
    // Multiple emails can map to the same tenant
    "jcecroyd@gmail.com": "bab45dab-19e8-4230-b18e-ee1f663608e5",
    "info@flyparksexeter.co.uk": "bab45dab-19e8-4230-b18e-ee1f663608e5",
    "eek_me@hotmail.com": "bab45dab-19e8-4230-b18e-ee1f663608e5", // Added for Flyparks email forwarding
    // Flyparks email addresses (for original senders, not forwarded)
    "noreply@flyparks.com": "bab45dab-19e8-4230-b18e-ee1f663608e5",
    "bookings@flyparks.com": "bab45dab-19e8-4230-b18e-ee1f663608e5",
    "info@flyparks.com": "bab45dab-19e8-4230-b18e-ee1f663608e5",
    // Flyparks domains (catch-all for any @flyparks.com or @flyparksexeter.co.uk)
    "flyparks.com": "bab45dab-19e8-4230-b18e-ee1f663608e5",
    "flyparksexeter.co.uk": "bab45dab-19e8-4230-b18e-ee1f663608e5",
    // Add more email addresses here as needed
    // "another@email.com": "bab45dab-19e8-4230-b18e-ee1f663608e5",
  };
}

function detectTenantFromEmail(email: { 
  from_address?: string | null; 
  subject?: string | null;
  raw_rfc822_base64?: string | null;
}): string | null {
  const map = getEmailTenantMap();
  
  // Try explicit email address mapping
  if (email.from_address) {
    const fromLower = email.from_address.toLowerCase().trim();
    if (map[fromLower]) {
      return map[fromLower];
    }

    // Try domain mapping
    const domain = fromLower.split("@")[1];
    if (domain && map[domain]) {
      return map[domain];
    }
  }

  // For forwarded emails, check subject and content for Flyparks indicators
  // This handles cases where emails are forwarded and the "from" address changes
  if (email.subject) {
    const subjectLower = email.subject.toLowerCase();
    
    // Check for Flyparks indicators in subject
    if (subjectLower.includes("flyparks") || 
        subjectLower.includes("payment successful") ||
        subjectLower.includes("booking confirmation")) {
      // If it looks like a Flyparks email, check if we can extract original sender from raw email
      if (email.raw_rfc822_base64) {
        try {
          const rawEmail = Buffer.from(email.raw_rfc822_base64, "base64").toString("utf-8");
          
          // Look for original sender in email headers (common in forwarded emails)
          const originalFromMatch = rawEmail.match(/^(?:X-Original-From|Reply-To|Return-Path):\s*([^\s<>]+@[^\s<>]+)/im);
          if (originalFromMatch) {
            const originalFrom = originalFromMatch[1].toLowerCase().trim();
            if (map[originalFrom]) {
              console.log(`[ingest-email] Found original sender in headers: ${originalFrom}`);
              return map[originalFrom];
            }
            // Try domain
            const originalDomain = originalFrom.split("@")[1];
            if (originalDomain && map[originalDomain]) {
              console.log(`[ingest-email] Found original domain in headers: ${originalDomain}`);
              return map[originalDomain];
            }
          }
          
          // Check for Flyparks email addresses in the raw email content
          const flyparksEmailPatterns = [
            /noreply@flyparks\.com/i,
            /bookings@flyparks\.com/i,
            /info@flyparks\.com/i,
            /info@flyparksexeter\.co\.uk/i,
            /@flyparks\./i,
          ];
          
          for (const pattern of flyparksEmailPatterns) {
            if (pattern.test(rawEmail)) {
              console.log(`[ingest-email] Detected Flyparks email pattern in content, using tenant mapping`);
              // Return the tenant ID for Flyparks (using info@flyparksexeter.co.uk mapping)
              return map["info@flyparksexeter.co.uk"] || map["eek_me@hotmail.com"];
            }
          }
        } catch (err) {
          console.error(`[ingest-email] Error parsing raw email for tenant detection:`, err);
        }
      }
      
      // Fallback: if subject suggests Flyparks and we have a Flyparks mapping, use it
      // This is a safety net for forwarded emails
      if (map["info@flyparksexeter.co.uk"]) {
        console.log(`[ingest-email] Subject suggests Flyparks, using Flyparks tenant mapping`);
        return map["info@flyparksexeter.co.uk"];
      }
    }
  }

  return null;
}

// Async function to parse files
async function parseFilesAsync(fileIds: string[], tenantId: string, emailId: string) {
  console.log(`[ingest-email] 🔄 Starting async parse for ${fileIds.length} files, tenant ${tenantId}`);
  
  try {
    console.log(`[ingest-email] 📦 Importing parseEmailFile module...`);
    const { parseEmailFile } = await import("@/lib/ingest/parseEmailFile");
    console.log(`[ingest-email] ✅ Module imported successfully`);
    
    for (const fileId of fileIds) {
      try {
        console.log(`[ingest-email] 🔍 Parsing file ${fileId}...`);
        const result = await parseEmailFile(fileId, tenantId);
        if (result.ok) {
          console.log(`[ingest-email] ✅ Auto-parsed file ${fileId}: ${result.importResult?.successCount || 0} bookings, ${result.importResult?.errorCount || 0} errors`);
        } else {
          console.error(`[ingest-email] ❌ Parse returned not ok for file ${fileId}:`, result);
        }
      } catch (err: any) {
        console.error(`[ingest-email] ❌ Auto-parse error for file ${fileId}:`, {
          message: err.message,
          stack: err.stack,
          name: err.name,
        });
      }
    }
    
    console.log(`[ingest-email] ✅ Completed async parse for ${fileIds.length} files`);
  } catch (err: any) {
    console.error(`[ingest-email] ❌ Failed to import parseEmailFile:`, {
      message: err.message,
      stack: err.stack,
    });
  }
}

type Attachment = {
  filename: string;
  content_type?: string;
  size?: number;
  data_base64: string;
};

type IngestPayload = {
  to?: string;
  from?: string;
  subject?: string;
  message_id?: string;
  received_at?: string;
  raw_rfc822_base64?: string;
  attachments?: Attachment[];
};

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();

  try {
    const secret = req.headers.get("x-ingest-secret") || "";
    if (!process.env.INGEST_SECRET) {
      return Response.json({ ok: false, requestId, error: "Missing INGEST_SECRET on server" }, { status: 500 });
    }
    if (secret !== process.env.INGEST_SECRET) {
      return Response.json({ ok: false, requestId, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as IngestPayload;

    const receivedAt = body.received_at ? new Date(body.received_at as string) : new Date();
    const raw = body.raw_rfc822_base64 || "";

    if (!raw || raw.length < 20) {
      return Response.json(
        { ok: false, requestId, error: "Missing/short raw_rfc822_base64", rawLen: raw.length },
        { status: 400 }
      );
    }

    const sha256 = crypto.createHash("sha256").update(raw).digest("hex");

    // Always parse raw email so we have subject + text for ingest_email_parses and (when no Worker attachments) for attachment extraction
    let extractedAttachments: Attachment[] = [];
    let emailBodyText: string | null = null;
    let parsedHtml: string | null = null;
    /** Set when simpleParser succeeds; used to write ingest_email_parses so parser runs automatically */
    let parsedForReceipt: { subject: string; text: string } | null = null;
    try {
      const rawEmailBuffer = Buffer.from(raw, "base64");
      const parsed = await simpleParser(rawEmailBuffer);
      const subject = parsed.subject ?? body.subject ?? "";
      const text = parsed.text ?? "";
      parsedForReceipt = { subject, text };

      // Extract email body text for Flyparks parsing
      emailBodyText = parsed.textAsHtml ? null : (parsed.text || parsed.html || null);
      if (!emailBodyText && parsed.html) {
        emailBodyText = parsed.html;
      }
      parsedHtml = parsed.html ?? null;

      // When Worker didn't send attachments, extract from parsed MIME
      if (!body.attachments || body.attachments.length === 0) {
        if (parsed.attachments && parsed.attachments.length > 0) {
          console.log(`[ingest-email] Extracting ${parsed.attachments.length} attachments from raw email`);
          for (const att of parsed.attachments) {
            try {
              const content = att.content as Buffer;
              extractedAttachments.push({
                filename: att.filename || att.contentId || "unnamed",
                content_type: att.contentType || "application/octet-stream",
                size: content.length,
                data_base64: content.toString("base64"),
              });
            } catch (err: unknown) {
              console.error(`[ingest-email] Failed to extract attachment:`, err);
            }
          }
        }
      }
    } catch (parseErr: unknown) {
      console.error(`[ingest-email] Failed to parse raw email:`, (parseErr as Error)?.message);
      // Continue; ingest_email_parses won't be written for this email
    }

    // Forward-aware body: for FW:/Fwd: Flyparks Payment Successful, use only forwarded region and strip signatures
    const parsableBodyText =
      emailBodyText != null
        ? getParsableBodyForDirectBooking({
            subject: body.subject,
            text: emailBodyText,
            html: parsedHtml,
          })
        : null;

    // Use Worker-provided attachments or server-extracted ones
    const allAttachments = body.attachments && body.attachments.length > 0 
      ? body.attachments 
      : extractedAttachments;

    // Log to Vercel (Functions logs)
    console.log("[ingest-email]", {
      requestId,
      to: body.to,
      from: body.from,
      subject: body.subject,
      messageId: body.message_id,
      sha256,
      rawLen: raw.length,
      attachmentsFromWorker: body.attachments?.length || 0,
      attachmentsExtracted: extractedAttachments.length,
      attachmentsTotal: allAttachments.length,
      attachments: allAttachments.map(a => ({ filename: a.filename, size: a.size })) || [],
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? "set" : "missing",
      supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? "set" : "missing",
    });

    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("ingest_emails")
      .insert({
        received_at: receivedAt.toISOString(),
        to_address: body.to || null,
        from_address: body.from || null,
        subject: body.subject || null,
        message_id: body.message_id || null,
        raw_rfc822_base64: raw,
        sha256,
        status: "received",
      })
      .select("id, sha256, message_id")
      .single();

    if (error) {
      const msg = (error as any).message || String(error);

      // Detect duplicate and report it clearly
      // Check for both message_id and sha256 unique constraint violations
      const isDup = 
        msg.includes("duplicate key") || 
        msg.includes("23505") ||
        msg.includes("ingest_emails_message_id_uidx") ||
        msg.includes("ingest_emails_sha256_uidx");

      return Response.json(
        {
          ok: true,
          requestId,
          inserted: false,
          deduped: isDup,
          sha256,
          messageId: body.message_id || null,
          insertError: msg,
        },
        { status: 200 }
      );
    }

    // Lookup tenant_id from to_address (tenant_inbound_inboxes)
    const toAddress = body.to ?? null;
    let tenantIdFromInbox: string | null = null;
    if (toAddress) {
      const { data: inboxRow, error: inboxErr } = await supabase
        .from("tenant_inbound_inboxes")
        .select("tenant_id")
        .eq("to_address", toAddress)
        .maybeSingle();
      if (inboxErr) {
        console.error("[ingest-email] tenant inbox lookup failed", inboxErr);
      }
      tenantIdFromInbox = inboxRow?.tenant_id ?? null;
    }

    // Ingest canary: if subject is [CANARY] with token=, mark run as received (proof of Email Routing + Worker + ingest)
    const subject = body.subject || "";
    if (subject.includes("[CANARY]") && subject.includes("token=")) {
      const tokenMatch = subject.match(/token=([A-Za-z0-9_-]+)/);
      if (tokenMatch?.[1]) {
        const token = tokenMatch[1];
        try {
          const { error: canaryError } = await supabase
            .from("ingest_canary_runs")
            .update({
              received_at: new Date().toISOString(),
              status: "received",
              last_error: null,
              processed_at: new Date().toISOString(),
              processed_status: "ok",
              processed_error: null,
            })
            .eq("token", token);
          if (canaryError) {
            console.warn(`[ingest-email] Canary token not found or update failed: token=${token}`, canaryError.message);
          } else {
            console.log(`[ingest-email] CANARY_RECEIVED`, { token, message_id: body.message_id || null, to_address: body.to || null });
          }
        } catch (e) {
          console.warn(`[ingest-email] Canary update error (non-fatal):`, e);
        }
      }
    }

    // Always write to ingest_email_parses so the parser runs automatically (forward receipt + plate/ref guesses)
    if (data && parsedForReceipt) {
      try {
        const forwarded_text = extractFlyparksReceiptFromForward(parsedForReceipt);
        const guessed = guessFlyparksFields(forwarded_text);
        const { error: parseRowErr } = await supabase.from("ingest_email_parses").upsert(
          {
            ingest_email_id: data.id,
            parsed_subject: parsedForReceipt.subject,
            parsed_text: parsedForReceipt.text,
            forwarded_text,
            booking_plate_guess: guessed.plate ?? null,
            booking_reference_guess: guessed.reference ?? null,
            parse_status: "parsed",
            parse_error: null,
            parsed_at: new Date().toISOString(),
          },
          { onConflict: "ingest_email_id" }
        );
        if (parseRowErr) {
          console.error(`[ingest-email] ingest_email_parses upsert failed:`, parseRowErr.message);
        } else {
          console.log(`[ingest-email] Wrote ingest_email_parses for email ${data.id}`);
        }

        // Text-only Flyparks: staging → bookings (same pipeline as attachments). Only when NO attachments.
        const isTextOnly = !allAttachments || allAttachments.length === 0;
        const subjectLower = (parsedForReceipt?.subject ?? "").toLowerCase();
        const textLower = (forwarded_text ?? "").toLowerCase();
        const looksLikeFlyparksReceipt =
          subjectLower.includes("flyparks") ||
          subjectLower.includes("payment successful") ||
          subjectLower.includes("booking confirmation") ||
          textLower.includes("booking receipt") ||
          textLower.includes("reference:") ||
          (body.from && /flyparksexeter|flyparks\.com/i.test(body.from));

        if (isTextOnly && looksLikeFlyparksReceipt) {
          try {
            // Resolve tenant: inbox first, then from/subject/raw (forwarded Flyparks)
            const tenantId =
              tenantIdFromInbox ??
              detectTenantFromEmail({
                from_address: body.from,
                subject: parsedForReceipt.subject,
                raw_rfc822_base64: raw,
              });

            console.log("[ingest] tenant resolved", { emailId: data.id, to: toAddress, tenantId });

            if (!tenantId) {
              console.warn("[ingest-email] Flyparks text-only: no tenant (to_address not in tenant_inbound_inboxes and detectTenantFromEmail returned null)");
            } else {
              const { flyparksTextToStaging } = await import("@/lib/ingest/flyparksTextToStaging");
              const { promoteStagingRowToBooking } = await import("@/lib/ingest/promoteStagingToBooking");
              const staging = flyparksTextToStaging(forwarded_text ?? "");
              console.log("[ingest] flyparks text staging extracted", { emailId: data.id, reference: staging.reference, plate: staging.vehicle_reg, total: staging.total_price });

              const reference = staging.reference ?? guessed?.reference ?? null;
              if (reference) {
                const dedupe_key = `${tenantId}|flyparks_text|${reference}`;
                const { data: stagingUpserted, error: stagingErr } = await supabase
                  .from("booking_import_staging")
                  .upsert(
                    {
                      tenant_id: tenantId,
                      source: "direct",
                      source_email_id: data.id,
                      source_filename: "flyparks_text",
                      reference,
                      external_reference: reference,
                      external_status: null,
                      start_at: staging.start_at,
                      end_at: staging.end_at,
                      vehicle_reg: staging.vehicle_reg,
                      vehicle_make: staging.vehicle_make,
                      vehicle_model: staging.vehicle_model,
                      vehicle_colour: staging.vehicle_colour,
                      customer_title: null,
                      customer_firstname: null,
                      customer_lastname: null,
                      customer_name: staging.customer_name,
                      phone: staging.customer_phone,
                      flight_number: staging.flight_number,
                      return_flight_no: staging.flight_number,
                      product_code: staging.product_code,
                      currency: staging.currency ?? "GBP",
                      total_price: staging.total_price,
                      price: staging.total_price ?? staging.money_charged ?? 0,
                      status: "reserved",
                      money_received: staging.money_received ?? staging.total_price ?? 0,
                      notes: null,
                      dedupe_key,
                      raw_json: staging.raw_json,
                    },
                    { onConflict: "dedupe_key" }
                  )
                  .select("id")
                  .maybeSingle();

                if (stagingErr) {
                  console.error("[ingest-email] booking_import_staging upsert failed:", stagingErr.message);
                  throw stagingErr;
                }

                const stagingId = stagingUpserted?.id ?? null;
                console.log("[ingest] staging upserted", { emailId: data.id, stagingId });

                const promoteResult = await promoteStagingRowToBooking(supabase, tenantId, dedupe_key);
                if (!promoteResult.ok) {
                  console.error("[ingest-email] promote staging → booking failed:", promoteResult.error);
                  throw new Error(promoteResult.error);
                }

                console.log("[ingest] promoted to booking", { emailId: data.id, bookingId: promoteResult.bookingId });
              } else {
                console.warn("[ingest-email] Flyparks text-only: no reference extracted (staging.reference and guessed.reference both null), skipping staging");
              }
            }
          } catch (textOnlyErr: unknown) {
            const err = textOnlyErr instanceof Error ? textOnlyErr : new Error(String(textOnlyErr));
            console.error("[ingest] text-only flyparks promote failed", { emailId: data.id, err: err.message, stack: err.stack });

            const errorStr = err.message ?? String(textOnlyErr);
            await supabase
              .from("ingest_emails")
              .update({ status: "failed", error: errorStr })
              .eq("id", data.id);

            await supabase
              .from("ingest_email_parses")
              .update({ parse_status: "parsed", parse_error: errorStr })
              .eq("ingest_email_id", data.id);
          }
        } else if (isTextOnly && !looksLikeFlyparksReceipt) {
          // Not a Flyparks receipt, nothing to stage
        } else if (!isTextOnly) {
          // Has attachments; staging will come from parseEmailFile, not from text
        }
      } catch (receiptErr: unknown) {
        console.error(`[ingest-email] Forward receipt extract failed (non-fatal):`, receiptErr);
      }
    }

    // Process attachments if any
    const fileIds: string[] = [];
    if (allAttachments && allAttachments.length > 0 && data) {
      console.log(`[ingest-email] Processing ${allAttachments.length} attachments for email ${data.id}`);
      for (const attachment of allAttachments) {
        try {
          // Generate storage path
          const timestamp = Date.now();
          const sanitizedFilename = attachment.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
          const storagePath = `${data.id}/${timestamp}-${sanitizedFilename}`;

          // Check if file is an image (non-booking attachment)
          const isImage = isImageFile(attachment.filename, attachment.content_type);
          
          // Store file metadata in database
          const { data: fileData, error: fileError } = await supabase
            .from("ingest_email_files")
            .insert({
              email_id: data.id,
              filename: attachment.filename,
              content_type: attachment.content_type || null,
              file_size: attachment.size || null,
              storage_bucket: "email-imports",
              storage_path: storagePath,
              parse_status: isImage ? "parsed" : "pending", // Mark images as parsed immediately
              parse_outcome: isImage ? "skipped" : null,
              parse_reason: isImage ? "non_booking_attachment:image" : null,
            })
            .select("id")
            .single();

          if (!fileError && fileData) {
            fileIds.push(fileData.id);

            // Store file in Supabase Storage
            try {
              const fileBuffer = Buffer.from(attachment.data_base64, "base64");
              console.log(`[ingest-email] Uploading ${attachment.filename} (${fileBuffer.length} bytes) to bucket email-imports`);
              
              const { data: uploadData, error: storageError } = await supabase.storage
                .from("email-imports")
                .upload(storagePath, fileBuffer, {
                  contentType: attachment.content_type || "application/octet-stream",
                  upsert: false,
                });

              if (storageError) {
                console.error(`[ingest-email] Storage upload failed for ${attachment.filename}:`, {
                  error: storageError.message,
                  errorCode: (storageError as any).error,
                });
                // Update file status to failed
                const errorMsg = storageError.message || "unknown error";
                await supabase
                  .from("ingest_email_files")
                  .update({ 
                    parse_outcome: "failed",
                    parse_status: "failed", 
                    parse_error: `Storage upload failed: ${errorMsg}`,
                    parse_reason: `exception:${errorMsg.substring(0, 200)}`,
                  })
                  .eq("id", fileData.id);
              } else {
                if (isImage) {
                  console.log(`[ingest-email] Skipped image file ${attachment.filename} (non-booking attachment)`);
                } else {
                  console.log(`[ingest-email] Successfully uploaded ${attachment.filename} to ${storagePath}`);
                }
              }
            } catch (storageErr: any) {
              console.error(`[ingest-email] Storage exception for ${attachment.filename}:`, {
                message: storageErr.message,
                stack: storageErr.stack,
              });
            }
          } else {
            console.error(`[ingest-email] Failed to insert file record:`, fileError);
          }
        } catch (attErr: any) {
          console.error(`[ingest-email] Error processing attachment ${attachment.filename}:`, attErr);
        }
      }
    }

    // If no attachments, check email body text for Flyparks bookings
    if (fileIds.length === 0 && parsableBodyText && data) {
      // Guard: don't create a booking from signature/QR-only content
      const looksLikeOnlySignatureOrQr =
        !parsableBodyText ||
        parsableBodyText.length < 80 ||
        (/qr code/i.test(parsableBodyText) &&
          !/booking|vehicle|registration|arrival|departure|date|time/i.test(parsableBodyText));

      if (!looksLikeOnlySignatureOrQr) {
        const { mapFlyparksEmailText } = await import("@/lib/importers/canonical/mappers");
        
        // Check if email body looks like a Flyparks booking confirmation
        if (
          parsableBodyText.includes("Departure date") ||
          parsableBodyText.includes("Booking Confirmation") ||
          (parsableBodyText.includes("Reference:") && parsableBodyText.includes("Vehicle registration"))
        ) {
          console.log(`[ingest-email] Detected Flyparks booking in email body, creating virtual file`);
          
          try {
            // Create a "virtual file" entry for the email body text (parsable = forward-stripped)
            const timestamp = Date.now();
            const storagePath = `${data.id}/${timestamp}-email-body.txt`;
            const bodyBuffer = Buffer.from(parsableBodyText, "utf-8");
          
          // Store file metadata (email body is booking-capable)
          const { data: fileData, error: fileError } = await supabase
            .from("ingest_email_files")
            .insert({
              email_id: data.id,
              filename: "email-body.txt",
              content_type: "text/plain",
              file_size: bodyBuffer.length,
              storage_bucket: "email-imports",
              storage_path: storagePath,
              parse_status: "pending",
              parse_outcome: null, // Will be set when parsed
            })
            .select("id")
            .single();
          
          if (!fileError && fileData) {
            fileIds.push(fileData.id);
            
            // Store email body text in Supabase Storage
            const { error: storageError } = await supabase.storage
              .from("email-imports")
              .upload(storagePath, bodyBuffer, {
                contentType: "text/plain",
                upsert: false,
              });
            
            if (storageError) {
              console.error(`[ingest-email] Failed to store email body:`, storageError);
            } else {
              console.log(`[ingest-email] Stored email body as virtual file for Flyparks parsing`);
            }
          }
          } catch (bodyErr: any) {
            console.error(`[ingest-email] Error processing email body:`, bodyErr);
          }
        }
      } else {
        console.log(`[ingest-email] Skipping email body: signature_or_qr_noise (not creating virtual file)`);
      }
    }

    // Log final status
    if (allAttachments && allAttachments.length > 0) {
      console.log(`[ingest-email] Final status: ${allAttachments.length} attachments processed, ${fileIds.length} files stored`);
    } else if (fileIds.length > 0) {
      console.log(`[ingest-email] Final status: ${fileIds.length} file(s) created from email body`);
    } else {
      console.log(`[ingest-email] No attachments or parseable content in email from ${body.from}`);
    }

    // Auto-parse files if tenant mapping exists
    const tenantId = fileIds.length > 0 ? detectTenantFromEmail({ 
      from_address: body.from, 
      subject: body.subject,
      raw_rfc822_base64: raw,
    }) : null;
    
    console.log(`[ingest-email] Auto-parse check:`, {
      fileIdsCount: fileIds.length,
      fileIds: fileIds,
      fromAddress: body.from,
      tenantIdFound: !!tenantId,
      tenantId: tenantId,
      tenantMap: getEmailTenantMap(),
    });
    
    if (fileIds.length > 0 && tenantId) {
      console.log(`[ingest-email] 🚀 Auto-parsing ${fileIds.length} files for tenant ${tenantId}`);
      
      // Wait for parsing to complete (synchronous approach for serverless)
      // This ensures parsing finishes before the response is sent
      try {
        await parseFilesAsync(fileIds, tenantId, data.id);
        console.log(`[ingest-email] ✅ Auto-parse completed for all files`);
      } catch (parseErr: any) {
        console.error(`[ingest-email] ❌ Auto-parse failed:`, {
          message: parseErr?.message,
          stack: parseErr?.stack,
          name: parseErr?.name,
        });
        // Don't fail the request - files are stored, parsing can be retried manually
      }
    } else if (fileIds.length > 0) {
      console.log(`[ingest-email] ⚠️ No tenant mapping for ${body.from}, files will remain pending`);
      console.log(`[ingest-email] Available tenant map:`, getEmailTenantMap());
    } else {
      console.log(`[ingest-email] ⚠️ No fileIds to parse (attachments may have failed to store)`);
    }

    return Response.json({ 
      ok: true, 
      requestId, 
      inserted: true, 
      deduped: false, 
      sha256, 
      row: data,
      attachments_received: allAttachments.length,
      attachments_stored: fileIds.length,
      file_ids: fileIds,
      auto_parse_triggered: !!tenantId,
    }, { status: 200 });
  } catch (err: any) {
    return Response.json(
      { ok: false, requestId, error: err?.message || "unknown error" },
      { status: 500 }
    );
  }
}
