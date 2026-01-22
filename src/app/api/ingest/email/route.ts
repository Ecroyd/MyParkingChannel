import crypto from "crypto";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

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

    // Log to Vercel (Functions logs)
    console.log("[ingest-email]", {
      requestId,
      to: body.to,
      from: body.from,
      subject: body.subject,
      messageId: body.message_id,
      sha256,
      rawLen: raw.length,
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
    if (body.attachments && body.attachments.length > 0 && data) {
      for (const attachment of body.attachments) {
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
              const { error: storageError } = await supabase.storage
                .from("email-imports")
                .upload(storagePath, fileBuffer, {
                  contentType: attachment.content_type || "application/octet-stream",
                  upsert: false,
                });

              if (storageError) {
                console.error(`[ingest-email] Storage upload failed for ${attachment.filename}:`, storageError);
                // Update file status to failed
                await supabase
                  .from("ingest_email_files")
                  .update({ parse_status: "failed", parse_error: `Storage upload failed: ${storageError.message}` })
                  .eq("id", fileData.id);
              }
            } catch (storageErr: any) {
              console.error(`[ingest-email] Storage error for ${attachment.filename}:`, storageErr);
            }
          } else {
            console.error(`[ingest-email] Failed to insert file record:`, fileError);
          }
        } catch (attErr: any) {
          console.error(`[ingest-email] Error processing attachment ${attachment.filename}:`, attErr);
        }
      }
    }

    return Response.json({ 
      ok: true, 
      requestId, 
      inserted: true, 
      deduped: false, 
      sha256, 
      row: data,
      attachments_received: body.attachments?.length || 0,
      attachments_stored: fileIds.length,
      file_ids: fileIds,
    }, { status: 200 });
  } catch (err: any) {
    return Response.json(
      { ok: false, requestId, error: err?.message || "unknown error" },
      { status: 500 }
    );
  }
}
