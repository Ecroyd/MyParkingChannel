import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { guessPlateFromEmailText } from "@/lib/ingest/plateGuess";

/**
 * Extract the *useful* receipt content from a forwarded email.
 * Strategy:
 * 1) Prefer the section after "Booking Confirmation - ***BOOKING RECEIPT***"
 * 2) Else fallback to section after "From: Flyparks Exeter Ltd Website"
 */
function extractForwardedReceiptText(decoded: string) {
  const marker1 = "Booking Confirmation - ***BOOKING RECEIPT***";
  const idx1 = decoded.indexOf(marker1);
  if (idx1 !== -1) return decoded.slice(idx1);

  const marker2 = "From: Flyparks Exeter Ltd Website";
  const idx2 = decoded.indexOf(marker2);
  if (idx2 !== -1) return decoded.slice(idx2);

  // last resort: return decoded (but we'll avoid parsing images below)
  return decoded;
}

// strip obvious MIME/base64 blocks so text parsing works
function stripMimeNoise(s: string) {
  // remove big base64 bodies
  s = s.replace(
    /Content-Transfer-Encoding:\s*base64[\s\S]*?(?:\r?\n--|\r?\n$)/gi,
    "\n--"
  );
  // remove cid image lines
  s = s.replace(/\[cid:[^\]]+\]/gi, "");
  return s;
}

function guessPlate(text: string) {
  return guessPlateFromEmailText(text);
}

function guessReference(text: string) {
  // your Flyparks reference appears as:
  // Reference:
  // 40774
  const m = text.match(/Reference:\s*\r?\n\s*([0-9]{3,10})/i);
  return m?.[1] ?? null;
}

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Missing id" },
        { status: 400 }
      );
    }

    const sb = getServiceSupabase();

    // 1) load email row
    const { data: email, error: e1 } = await sb
      .from("ingest_emails")
      .select("id, subject, raw_rfc822_base64, status")
      .eq("id", id)
      .single();

    if (e1) throw new Error(`Load ingest_emails failed: ${e1.message}`);
    if (!email) throw new Error("Email not found");

    // 2) decode + extract forwarded receipt
    const decoded = Buffer.from(email.raw_rfc822_base64, "base64").toString(
      "utf8"
    );
    const forwarded = extractForwardedReceiptText(decoded);
    const cleaned = stripMimeNoise(forwarded);

    // 3) guesses
    const plate = guessPlate(cleaned);
    const ref = guessReference(cleaned);

    // 4) insert parse row (upsert by ingest_email_id so re-parsing overwrites)
    const { error: e2 } = await sb.from("ingest_email_parses").upsert(
      {
        ingest_email_id: email.id,
        parsed_subject: email.subject,
        forwarded_text: cleaned,
        booking_plate_guess: plate,
        booking_reference_guess: ref,
        parse_status: "parsed",
        parse_error: null,
        parsed_at: new Date().toISOString(),
      },
      { onConflict: "ingest_email_id" }
    );

    if (e2) throw new Error(`Insert ingest_email_parses failed: ${e2.message}`);

    // 5) update email status
    const { error: e3 } = await sb
      .from("ingest_emails")
      .update({ status: "parsed" })
      .eq("id", email.id);

    if (e3) throw new Error(`Update ingest_emails failed: ${e3.message}`);

    return NextResponse.json({
      ok: true,
      id: email.id,
      plate,
      ref,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
