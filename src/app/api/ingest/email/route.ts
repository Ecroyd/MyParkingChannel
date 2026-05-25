import crypto from "crypto";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  processIngestEmail,
  type IngestAttachment,
} from "@/lib/ingest/processIngestEmail";

export const runtime = "nodejs";

type IngestPayload = {
  to?: string;
  from?: string;
  subject?: string;
  message_id?: string;
  received_at?: string;
  raw_rfc822_base64?: string;
  attachments?: IngestAttachment[];
};

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();

  try {
    const secret = req.headers.get("x-ingest-secret") || "";
    if (!process.env.INGEST_SECRET) {
      return Response.json(
        { ok: false, requestId, error: "Missing INGEST_SECRET on server" },
        { status: 500 }
      );
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

    console.log("[ingest-email]", {
      requestId,
      to: body.to,
      from: body.from,
      subject: body.subject,
      messageId: body.message_id,
      sha256,
      rawLen: raw.length,
      attachmentsFromWorker: body.attachments?.length || 0,
    });

    const supabase = getServiceSupabase();

    // 1) Always persist raw email first — never parse before storage
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
      const msg = (error as { message?: string }).message || String(error);
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

    const emailId = data.id;

    // Ingest canary (non-fatal)
    const subject = body.subject || "";
    if (subject.includes("[CANARY]") && subject.includes("token=")) {
      const tokenMatch = subject.match(/token=([A-Za-z0-9_-]+)/);
      if (tokenMatch?.[1]) {
        const token = tokenMatch[1];
        try {
          await supabase
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
        } catch (e) {
          console.warn("[ingest-email] Canary update error (non-fatal):", e);
        }
      }
    }

    // 2) Parse / booking pipeline — failures must not fail HTTP (Cloudflare already delivered)
    let pipelineResult: Awaited<ReturnType<typeof processIngestEmail>> | null = null;
    try {
      pipelineResult = await processIngestEmail(supabase, {
        emailId,
        raw_rfc822_base64: raw,
        to_address: body.to,
        from_address: body.from,
        subject: body.subject,
        message_id: body.message_id,
        workerAttachments: body.attachments,
      });
    } catch (pipelineErr: unknown) {
      const message =
        pipelineErr instanceof Error ? pipelineErr.message : String(pipelineErr);
      console.error("[ingest-email] unexpected pipeline throw", { emailId, message });
      pipelineResult = { ok: false, error: message };
    }

    return Response.json(
      {
        ok: true,
        requestId,
        inserted: true,
        deduped: false,
        sha256,
        row: data,
        email_id: emailId,
        pipeline: pipelineResult,
        processing_ok: pipelineResult?.ok ?? false,
        processing_error: pipelineResult?.ok ? null : pipelineResult?.error ?? null,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    return Response.json({ ok: false, requestId, error: message }, { status: 500 });
  }
}
