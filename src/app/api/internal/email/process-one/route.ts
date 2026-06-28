/**
 * One-off internal endpoint: reprocess a single ingest_email (parse + text→staging→promote).
 * Use when an email (e.g. 06cf…) already landed but never got a staging row (e.g. inline attachments broke the gate).
 *
 * Auth: Authorization: Bearer INTERNAL_CRON_KEY or x-internal-cron-key
 * POST /api/internal/email/process-one
 * Body: { emailId: "uuid" }
 */
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
// @ts-ignore - mailparser types
import { simpleParser } from "mailparser";
import { extractFlyparksReceiptFromForward, guessFlyparksFields } from "@/lib/email/flyparksForward";
import { flyparksTextToStaging } from "@/lib/ingest/flyparksTextToStaging";
import { promoteStagingRowToBooking } from "@/lib/ingest/promoteStagingToBooking";
import { safeStagingUpsertPayload } from "@/lib/ingest/safeStagingUpsertPayload";

function requireInternalAuth(req: Request): { ok: true; token: string } | { ok: false; status: number; error: string } {
  const token = process.env.INTERNAL_CRON_KEY?.trim();
  if (!token) {
    return { ok: false, status: 500, error: "INTERNAL_CRON_KEY not configured" };
  }
  const auth = req.headers.get("authorization") ?? "";
  const xKey = req.headers.get("x-internal-cron-key")?.trim() ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const bearerToken = m ? m[1].trim() : "";
  if (bearerToken === token || xKey === token) {
    return { ok: true, token };
  }
  return { ok: false, status: 401, error: "unauthorized" };
}

export async function POST(req: Request) {
  try {
    const authResult = requireInternalAuth(req);
    if (!authResult.ok) {
      return NextResponse.json({ ok: false, error: authResult.error }, { status: authResult.status });
    }

    let body: { emailId?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
    }

    const emailId = body?.emailId;
    if (!emailId) {
      return NextResponse.json({ ok: false, error: "missing emailId" }, { status: 400 });
    }

    try {
      return await processOneEmail(emailId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      console.error("[process-one] error", { emailId, message, stack });
      return NextResponse.json(
        { ok: false, error: message, stack: stack ?? null },
        { status: 500 }
      );
    }
  } catch (topErr: unknown) {
    const message = topErr instanceof Error ? topErr.message : String(topErr);
    const stack = topErr instanceof Error ? topErr.stack : null;
    console.error("[process-one] top-level error", { message, stack });
    return NextResponse.json(
      { ok: false, error: message, stack },
      { status: 500 }
    );
  }
}

async function processOneEmail(emailId: string) {
  const supabase = getServiceSupabase();

  const { data: email, error: emailErr } = await supabase
    .from("ingest_emails")
    .select("id, to_address, from_address, subject, raw_rfc822_base64")
    .eq("id", emailId)
    .single();

  if (emailErr || !email) {
    return NextResponse.json(
      { ok: false, error: emailErr?.message ?? "email not found" },
      { status: 404 }
    );
  }

  const rawBase64 = email.raw_rfc822_base64;
  if (!rawBase64 || typeof rawBase64 !== "string") {
    return NextResponse.json({ ok: false, error: "email has no raw body" }, { status: 400 });
  }

  const raw = Buffer.from(rawBase64, "base64");
  const parsed = await simpleParser(raw);
  const text = parsed.text ?? parsed.html ?? "";
  const forwardedText = extractFlyparksReceiptFromForward({ subject: parsed.subject ?? "", text });

  const { data: inboxRow, error: inboxErr } = await supabase
    .from("tenant_inbound_inboxes")
    .select("tenant_id")
    .ilike("to_address", String(email.to_address ?? "").trim())
    .maybeSingle();

  if (inboxErr) {
    return NextResponse.json({ ok: false, error: inboxErr.message }, { status: 500 });
  }

  const tenantId = inboxRow?.tenant_id ?? null;
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "no tenant for to_address" }, { status: 400 });
  }

  const staging = flyparksTextToStaging(forwardedText);
  const guessed = guessFlyparksFields(forwardedText);
  const reference = staging.reference ?? guessed?.reference ?? null;

  if (!reference) {
    return NextResponse.json({ ok: false, error: "no reference found" }, { status: 400 });
  }

  const dedupe_key = `${tenantId}|flyparks_text|${reference}`;

  const stagingPayload = safeStagingUpsertPayload({
    tenant_id: tenantId,
    source: "direct",
    source_email_id: email.id,
    source_filename: "flyparks_text",
    reference,
    external_reference: reference,
    external_status: "RESERVED",
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
    customer_email: staging.customer_email,
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
  });
  if (!stagingPayload.ok) {
    return NextResponse.json({ ok: false, error: stagingPayload.error }, { status: 500 });
  }

  const { data: stagingUpserted, error: stagingErr } = await supabase
    .from("booking_import_staging")
    .upsert(stagingPayload.data, { onConflict: "dedupe_key" })
    .select("id")
    .maybeSingle();

  if (stagingErr) {
    return NextResponse.json({ ok: false, error: stagingErr.message }, { status: 500 });
  }

  const promoteResult = await promoteStagingRowToBooking(supabase, tenantId, dedupe_key);
  if (!promoteResult.ok) {
    return NextResponse.json({ ok: false, error: promoteResult.error }, { status: 500 });
  }

  await supabase
    .from("ingest_emails")
    .update({ status: "parsed", error: null })
    .eq("id", email.id);

  return NextResponse.json({
    ok: true,
    reference,
    stagingId: stagingUpserted?.id ?? null,
    bookingId: promoteResult.bookingId ?? null,
  });
}
