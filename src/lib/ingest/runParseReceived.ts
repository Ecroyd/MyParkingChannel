import { getServiceSupabase } from "@/lib/supabase/service";
import { simpleParser } from "mailparser";
import {
  extractFlyparksReceiptFromForward,
  guessFlyparksFields,
} from "@/lib/email/flyparksForward";

/**
 * Batch-parse received emails that don't yet have a row in ingest_email_parses.
 * Used by POST /api/internal/email/parse-received and by cron.
 */
export async function runParseReceived(limit = 25): Promise<{
  parsedCount: number;
  error?: string;
}> {
  const supabase = getServiceSupabase();

  const { data: emails, error } = await supabase
    .from("ingest_emails")
    .select("id, raw_rfc822_base64, subject, status")
    .eq("status", "received")
    .order("received_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { parsedCount: 0, error: error.message };
  }

  let parsedCount = 0;

  for (const e of emails ?? []) {
    const { data: existing } = await supabase
      .from("ingest_email_parses")
      .select("id")
      .eq("ingest_email_id", e.id)
      .maybeSingle();

    if (existing) continue;

    try {
      const raw = Buffer.from(e.raw_rfc822_base64, "base64");
      const parsed = await simpleParser(raw);

      const subject = parsed.subject ?? e.subject ?? "";
      const text = parsed.text ?? "";

      const forwarded_text = extractFlyparksReceiptFromForward({ subject, text });
      const guessed = guessFlyparksFields(forwarded_text);

      const { error: insErr } = await supabase.from("ingest_email_parses").insert({
        ingest_email_id: e.id,
        parsed_subject: subject,
        parsed_text: text,
        forwarded_text,
        booking_plate_guess: guessed.plate ?? null,
        booking_reference_guess: guessed.reference ?? null,
        parse_status: "parsed",
        parsed_at: new Date().toISOString(),
      });

      if (insErr) throw new Error(insErr.message);
      parsedCount++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "unknown_error";
      await supabase.from("ingest_email_parses").insert({
        ingest_email_id: e.id,
        parsed_subject: e.subject ?? null,
        parse_status: "failed",
        parse_error: message,
        parsed_at: new Date().toISOString(),
      });
    }
  }

  return { parsedCount };
}
