import crypto from "crypto";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs"; // needs Node crypto

type IngestPayload = {
  to?: string;
  from?: string;
  subject?: string;
  received_at?: string;
  raw_rfc822_base64?: string;
};

export async function POST(req: Request) {
  console.log("INGEST HIT");

  return Response.json({ ok: true });

  try {
    // 1) Authenticate Cloudflare Worker
    const secret = req.headers.get("x-ingest-secret") || "";
    const expectedSecret = process.env.INGEST_SECRET;
    if (!expectedSecret) {
      console.error("[INGEST] INGEST_SECRET env var not set");
      return new Response("Server not configured", { status: 500 });
    }
    // TypeScript: expectedSecret is now guaranteed to be defined after the check above
    const validSecret: string = expectedSecret;
    if (secret !== validSecret) {
      console.error("[INGEST] Secret mismatch", {
        receivedLength: secret.length,
        expectedLength: validSecret.length,
        receivedPrefix: secret.substring(0, 10),
        expectedPrefix: validSecret.substring(0, 10),
      });
      return new Response("Unauthorized", { status: 401 });
    }

    // 2) Parse payload
    const body = (await req.json()) as IngestPayload;

    const receivedAt = body.received_at ? new Date(body.received_at) : new Date();
    const raw = body.raw_rfc822_base64 || "";

    if (!raw || raw.length < 20) {
      return new Response("Missing raw_rfc822_base64", { status: 400 });
    }

    // 3) Dedupe hash (hash the base64 string)
    const sha256 = crypto.createHash("sha256").update(raw).digest("hex");

    // 4) Insert into Supabase (idempotent via unique index)
    const supabase = getServiceSupabase();
    const { error } = await supabase.from("ingest_emails").insert({
      received_at: receivedAt.toISOString(),
      to_address: body.to || null,
      from_address: body.from || null,
      subject: body.subject || null,
      raw_rfc822_base64: raw,
      sha256,
      status: "received",
    });

    // If it's a duplicate, treat as OK
    if (error) {
      // Supabase unique violation is typically "23505"
      // supabase-js error shape varies; safest: check message
      const msg = (error as any).message || "";
      if (msg.includes("duplicate key") || msg.includes("23505")) {
        return Response.json({ ok: true, deduped: true, sha256 });
      }
      return new Response(`Insert failed: ${msg}`, { status: 500 });
    }

    return Response.json({ ok: true, deduped: false, sha256 });
  } catch (err: any) {
    return new Response(`Bad request: ${err?.message || "unknown error"}`, { status: 400 });
  }
}
