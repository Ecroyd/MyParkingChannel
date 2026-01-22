import crypto from "crypto";
import { getServiceSupabase } from "@/lib/supabase/service";
// @ts-ignore - mailparser types may not be fully compatible
import { simpleParser } from "mailparser";

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
    // Add more email addresses here as needed
    // "another@email.com": "bab45dab-19e8-4230-b18e-ee1f663608e5",
  };
}

function detectTenantFromEmail(email: { from_address?: string | null; subject?: string | null }): string | null {
  const map = getEmailTenantMap();
  
  // Try explicit email address mapping
  if (email.from_address && map[email.from_address]) {
    return map[email.from_address];
  }

  // Try domain mapping
  if (email.from_address) {
    const domain = email.from_address.split("@")[1];
    if (domain && map[domain]) {
      return map[domain];
    }
  }

  return null;
}

// Async function to parse files (fire-and-forget)
async function parseFilesAsync(fileIds: string[], tenantId: string, emailId: string) {
  const baseUrl = process.env.NEXT_PUBLIC_ROOT_URL || "http://localhost:3002";
  
  for (const fileId of fileIds) {
    try {
      const response = await fetch(`${baseUrl}/api/admin/ingest/parse-file`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileId, tenantId }),
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Unknown error" }));
        console.error(`[ingest-email] Auto-parse failed for file ${fileId}:`, error);
      } else {
        const result = await response.json();
        console.log(`[ingest-email] Auto-parsed file ${fileId}: ${result.importResult?.successCount || 0} bookings`);
      }
    } catch (err: any) {
      console.error(`[ingest-email] Auto-parse error for file ${fileId}:`, err.message);
    }
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

    // Parse attachments from raw email if not provided by Worker
    let extractedAttachments: Attachment[] = [];
    if (!body.attachments || body.attachments.length === 0) {
      // Worker didn't extract attachments, parse them server-side
      try {
        const rawEmailBuffer = Buffer.from(raw, "base64");
        const parsed = await simpleParser(rawEmailBuffer);
        
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
            } catch (err: any) {
              console.error(`[ingest-email] Failed to extract attachment:`, err);
            }
          }
        }
      } catch (parseErr: any) {
        console.error(`[ingest-email] Failed to parse raw email:`, parseErr.message);
        // Continue without attachments
      }
    }

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
              parse_status: "pending",
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
                await supabase
                  .from("ingest_email_files")
                  .update({ parse_status: "failed", parse_error: `Storage upload failed: ${storageError.message}` })
                  .eq("id", fileData.id);
              } else {
                console.log(`[ingest-email] Successfully uploaded ${attachment.filename} to ${storagePath}`);
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

    // Log final status
    if (allAttachments && allAttachments.length > 0) {
      console.log(`[ingest-email] Final status: ${allAttachments.length} attachments processed, ${fileIds.length} files stored`);
    } else {
      console.log(`[ingest-email] No attachments in email from ${body.from}`);
    }

    // Auto-parse files if tenant mapping exists (fire-and-forget, don't wait)
    const tenantId = fileIds.length > 0 ? detectTenantFromEmail({ from_address: body.from, subject: body.subject }) : null;
    if (fileIds.length > 0 && tenantId) {
      console.log(`[ingest-email] Auto-parsing ${fileIds.length} files for tenant ${tenantId}`);
      // Fire-and-forget: don't await, let it run in background
      parseFilesAsync(fileIds, tenantId, data.id).catch((err) => {
        console.error(`[ingest-email] Auto-parse failed:`, err);
      });
    } else if (fileIds.length > 0) {
      console.log(`[ingest-email] No tenant mapping for ${body.from}, files will remain pending`);
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
