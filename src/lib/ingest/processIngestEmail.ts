import type { SupabaseClient } from "@supabase/supabase-js";
// @ts-ignore - mailparser types may not be fully compatible
import { simpleParser } from "mailparser";
import { isImageFile } from "@/lib/ingest/fileTypeUtils";
import { getParsableBodyForDirectBooking } from "@/lib/email/forwarded";
import {
  extractFlyparksReceiptFromForward,
  guessFlyparksFields,
} from "@/lib/email/flyparksForward";
import { markIngestFailure, markIngestSuccess } from "@/lib/ingest/markIngestFailure";
import { detectTenantFromEmail } from "@/lib/ingest/detectTenantFromEmail";

export type IngestAttachment = {
  filename: string;
  content_type?: string;
  size?: number;
  data_base64: string;
};

export type ProcessIngestEmailInput = {
  emailId: string;
  raw_rfc822_base64: string;
  to_address?: string | null;
  from_address?: string | null;
  subject?: string | null;
  message_id?: string | null;
  workerAttachments?: IngestAttachment[];
};

export type ProcessIngestEmailResult = {
  ok: boolean;
  error?: string;
  fileIds?: string[];
  autoParseTriggered?: boolean;
  textPromoted?: boolean;
  bookingId?: string | null;
};

function hasBookingFileAttachment(atts: { contentType?: string; contentDisposition?: string; filename?: string }[] | undefined | null): boolean {
  const list = atts ?? [];
  return list.some((a) => {
    const ct = String(a?.contentType ?? "").toLowerCase();
    const cd = String(a?.contentDisposition ?? "").toLowerCase();
    const fn = String(a?.filename ?? "").toLowerCase();
    if (cd === "inline") return false;
    if (ct.startsWith("image/")) return false;
    if (fn.endsWith(".csv") || fn.endsWith(".pdf") || fn.endsWith(".xls") || fn.endsWith(".xlsx")) return true;
    if (ct.includes("csv") || ct.includes("pdf") || ct.includes("excel") || ct.includes("spreadsheet")) return true;
    return false;
  });
}

function looksLikeFlyparksReceipt(subject: string | null | undefined, text: string | null | undefined): boolean {
  const s = (subject ?? "").toLowerCase();
  const t = (text ?? "").toLowerCase();
  if (s.includes("flyparks") && (s.includes("payment") || s.includes("booking") || s.includes("successful"))) return true;
  if (t.includes("booking receipt")) return true;
  if (t.includes("your transaction has been completed")) return true;
  if (t.includes("reference:")) return true;
  if (t.includes("vehicle registration:")) return true;
  return false;
}

async function resolveTenantFromInbox(
  supabase: SupabaseClient,
  toAddress: string | null | undefined
): Promise<string | null> {
  if (!toAddress) return null;
  const { data: inboxRow, error: inboxErr } = await supabase
    .from("tenant_inbound_inboxes")
    .select("tenant_id")
    .eq("to_address", toAddress)
    .maybeSingle();
  if (inboxErr) {
    console.error("[process-ingest] tenant inbox lookup failed", inboxErr);
    return null;
  }
  return inboxRow?.tenant_id ?? null;
}

async function parseFilesAsync(fileIds: string[], tenantId: string) {
  const { parseEmailFile } = await import("@/lib/ingest/parseEmailFile");
  for (const fileId of fileIds) {
    try {
      await parseEmailFile(fileId, tenantId);
    } catch (err: unknown) {
      console.error(`[process-ingest] auto-parse error for file ${fileId}:`, err);
    }
  }
}

/**
 * Run MIME parse, ingest_email_parses, text promote, attachments, and optional auto-parse.
 * Caller must have already inserted ingest_emails with raw_rfc822_base64 preserved.
 */
export async function processIngestEmail(
  supabase: SupabaseClient,
  input: ProcessIngestEmailInput
): Promise<ProcessIngestEmailResult> {
  const {
    emailId,
    raw_rfc822_base64: raw,
    to_address: toAddress,
    from_address: fromAddress,
    subject: bodySubject,
    workerAttachments,
  } = input;

  let tenantIdFromInbox: string | null = null;
  let parseFailure: string | null = null;
  let bookingId: string | null = null;
  let textPromoted = false;

  try {
    tenantIdFromInbox = await resolveTenantFromInbox(supabase, toAddress ?? null);

    let extractedAttachments: IngestAttachment[] = [];
    let emailBodyText: string | null = null;
    let parsedHtml: string | null = null;
    let parsedForReceipt: { subject: string; text: string } | null = null;
    let parsedEmail: Awaited<ReturnType<typeof simpleParser>> | null = null;

    try {
      const rawEmailBuffer = Buffer.from(raw, "base64");
      const parsed = await simpleParser(rawEmailBuffer);
      parsedEmail = parsed;
      const subject = parsed.subject ?? bodySubject ?? "";
      const text = parsed.text ?? "";
      parsedForReceipt = { subject, text };
      emailBodyText = parsed.textAsHtml ? null : (parsed.text || parsed.html || null);
      if (!emailBodyText && parsed.html) {
        emailBodyText = parsed.html;
      }
      parsedHtml = parsed.html ?? null;

      if (!workerAttachments || workerAttachments.length === 0) {
        if (parsed.attachments && parsed.attachments.length > 0) {
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
              console.error("[process-ingest] attachment extract failed:", err);
            }
          }
        }
      }
    } catch (parseErr: unknown) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      console.error("[process-ingest] MIME parse failed:", msg);
      parseFailure = `MIME parse failed: ${msg}`;
    }

    const parsableBodyText =
      emailBodyText != null
        ? getParsableBodyForDirectBooking({
            subject: bodySubject,
            text: emailBodyText,
            html: parsedHtml,
          })
        : null;

    const allAttachments =
      workerAttachments && workerAttachments.length > 0
        ? workerAttachments
        : extractedAttachments;

    if (parsedForReceipt) {
      const forwarded_text = extractFlyparksReceiptFromForward(parsedForReceipt);
      const guessed = guessFlyparksFields(forwarded_text);
      const { error: parseRowErr } = await supabase.from("ingest_email_parses").upsert(
        {
          ingest_email_id: emailId,
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
        throw new Error(`ingest_email_parses upsert failed: ${parseRowErr.message}`);
      }

      const bookingFilePresent = hasBookingFileAttachment(parsedEmail?.attachments);
      const looksLikeFlyparks = looksLikeFlyparksReceipt(
        parsedForReceipt?.subject ?? null,
        forwarded_text ?? null
      );
      const shouldTryTextPromote = !bookingFilePresent && looksLikeFlyparks;

      if (shouldTryTextPromote) {
        const tenantId =
          tenantIdFromInbox ??
          detectTenantFromEmail({
            from_address: fromAddress,
            subject: parsedForReceipt.subject,
            raw_rfc822_base64: raw,
          });

        if (!tenantId) {
          throw new Error(
            "Flyparks text-only: no tenant (to_address not in tenant_inbound_inboxes and detectTenantFromEmail returned null)"
          );
        }

        const { flyparksTextToStaging } = await import("@/lib/ingest/flyparksTextToStaging");
        const { promoteStagingRowToBooking } = await import("@/lib/ingest/promoteStagingToBooking");
        const staging = flyparksTextToStaging(forwarded_text ?? "");
        const reference = staging.reference ?? guessed?.reference ?? null;

        if (!reference) {
          throw new Error("Flyparks text-only: no reference extracted");
        }

        const dedupe_key = `${tenantId}|flyparks_text|${reference}`;
        const { error: stagingErr } = await supabase.from("booking_import_staging").upsert(
          {
            tenant_id: tenantId,
            source: "direct",
            source_email_id: emailId,
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
        );

        if (stagingErr) {
          throw new Error(`booking_import_staging upsert failed: ${stagingErr.message}`);
        }

        const promoteResult = await promoteStagingRowToBooking(supabase, tenantId, dedupe_key);
        if (!promoteResult.ok) {
          throw new Error(promoteResult.error ?? "promote staging failed");
        }

        textPromoted = true;
        bookingId = promoteResult.bookingId ?? null;
      }
    } else if (parseFailure) {
      throw new Error(parseFailure);
    }

    const fileIds: string[] = [];
    if (allAttachments.length > 0) {
      for (const attachment of allAttachments) {
        try {
          const timestamp = Date.now();
          const sanitizedFilename = attachment.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
          const storagePath = `${emailId}/${timestamp}-${sanitizedFilename}`;
          const isImage = isImageFile(attachment.filename, attachment.content_type);

          const { data: fileData, error: fileError } = await supabase
            .from("ingest_email_files")
            .insert({
              email_id: emailId,
              filename: attachment.filename,
              content_type: attachment.content_type || null,
              file_size: attachment.size || null,
              storage_bucket: "email-imports",
              storage_path: storagePath,
              parse_status: isImage ? "parsed" : "pending",
              parse_outcome: isImage ? "skipped" : null,
              parse_reason: isImage ? "non_booking_attachment:image" : null,
            })
            .select("id")
            .single();

          if (!fileError && fileData) {
            fileIds.push(fileData.id);
            try {
              const fileBuffer = Buffer.from(attachment.data_base64, "base64");
              const { error: storageError } = await supabase.storage
                .from("email-imports")
                .upload(storagePath, fileBuffer, {
                  contentType: attachment.content_type || "application/octet-stream",
                  upsert: false,
                });
              if (storageError) {
                await supabase
                  .from("ingest_email_files")
                  .update({
                    parse_outcome: "failed",
                    parse_status: "failed",
                    parse_error: `Storage upload failed: ${storageError.message}`,
                  })
                  .eq("id", fileData.id);
              }
            } catch (storageErr: unknown) {
              console.error("[process-ingest] storage exception:", storageErr);
            }
          }
        } catch (attErr: unknown) {
          console.error("[process-ingest] attachment processing error:", attErr);
        }
      }
    }

    if (fileIds.length === 0 && parsableBodyText) {
      const looksLikeOnlySignatureOrQr =
        !parsableBodyText ||
        parsableBodyText.length < 80 ||
        (/qr code/i.test(parsableBodyText) &&
          !/booking|vehicle|registration|arrival|departure|date|time/i.test(parsableBodyText));

      if (
        !looksLikeOnlySignatureOrQr &&
        (parsableBodyText.includes("Departure date") ||
          parsableBodyText.includes("Booking Confirmation") ||
          (parsableBodyText.includes("Reference:") &&
            parsableBodyText.includes("Vehicle registration")))
      ) {
        const timestamp = Date.now();
        const storagePath = `${emailId}/${timestamp}-email-body.txt`;
        const bodyBuffer = Buffer.from(parsableBodyText, "utf-8");
        const { data: fileData, error: fileError } = await supabase
          .from("ingest_email_files")
          .insert({
            email_id: emailId,
            filename: "email-body.txt",
            content_type: "text/plain",
            file_size: bodyBuffer.length,
            storage_bucket: "email-imports",
            storage_path: storagePath,
            parse_status: "pending",
          })
          .select("id")
          .single();

        if (!fileError && fileData) {
          fileIds.push(fileData.id);
          await supabase.storage.from("email-imports").upload(storagePath, bodyBuffer, {
            contentType: "text/plain",
            upsert: false,
          });
        }
      }
    }

    const tenantIdForFiles =
      fileIds.length > 0
        ? tenantIdFromInbox ??
          detectTenantFromEmail({
            from_address: fromAddress,
            subject: bodySubject,
            raw_rfc822_base64: raw,
          })
        : null;

    let autoParseTriggered = false;
    if (fileIds.length > 0 && tenantIdForFiles) {
      autoParseTriggered = true;
      await parseFilesAsync(fileIds, tenantIdForFiles);
    }

    if (textPromoted) {
      await markIngestSuccess(supabase, emailId);
    } else {
      await supabase.from("ingest_emails").update({ error: null }).eq("id", emailId);
    }

    return {
      ok: true,
      fileIds,
      autoParseTriggered,
      textPromoted,
      bookingId,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[process-ingest] pipeline failed", { emailId, message });

    await markIngestFailure(supabase, {
      emailId,
      error: message,
      tenantId: tenantIdFromInbox,
      fromAddress: fromAddress ?? null,
      subject: bodySubject ?? null,
      toAddress: toAddress ?? null,
    });

    return { ok: false, error: message };
  }
}

/**
 * Reset email status before reprocessing from admin.
 */
export async function clearIngestEmailForReprocess(
  supabase: SupabaseClient,
  emailId: string
): Promise<void> {
  await supabase
    .from("ingest_emails")
    .update({ status: "received", error: null })
    .eq("id", emailId);
}
