import type { SupabaseClient } from "@supabase/supabase-js";
import { processIngestEmail } from "@/lib/ingest/processIngestEmail";
import { clearIngestEmailForReprocess } from "@/lib/ingest/markIngestFailure";

export type ReprocessOneResult = {
  ok: boolean;
  error?: string | null;
  bookingId?: string | null;
  textPromoted?: boolean;
  fileIds?: string[];
};

export async function reprocessIngestEmailById(
  supabase: SupabaseClient,
  emailId: string
): Promise<ReprocessOneResult> {
  const { data: email, error: emailErr } = await supabase
    .from("ingest_emails")
    .select("id, to_address, from_address, subject, message_id, raw_rfc822_base64")
    .eq("id", emailId)
    .single();

  if (emailErr || !email) {
    return { ok: false, error: emailErr?.message ?? "email not found" };
  }

  if (!email.raw_rfc822_base64) {
    return { ok: false, error: "email has no raw_rfc822_base64" };
  }

  await clearIngestEmailForReprocess(supabase, emailId);

  const result = await processIngestEmail(supabase, {
    emailId: email.id,
    raw_rfc822_base64: email.raw_rfc822_base64,
    to_address: email.to_address,
    from_address: email.from_address,
    subject: email.subject,
    message_id: email.message_id,
  });

  return {
    ok: result.ok,
    error: result.error ?? null,
    bookingId: result.bookingId ?? null,
    textPromoted: result.textPromoted ?? false,
    fileIds: result.fileIds ?? [],
  };
}

/** Prefer failed ingest row, then latest received_at for a booking reference guess. */
export async function findIngestEmailIdForReference(
  supabase: SupabaseClient,
  reference: string
): Promise<string | null> {
  const ref = reference.trim().toUpperCase();

  const { data: parseRows } = await supabase
    .from("ingest_email_parses")
    .select("ingest_email_id, parsed_at")
    .eq("booking_reference_guess", ref)
    .order("parsed_at", { ascending: false })
    .limit(20);

  const emailIds = [...new Set((parseRows ?? []).map((row) => row.ingest_email_id as string))];
  if (emailIds.length > 0) {
    const { data: emails } = await supabase
      .from("ingest_emails")
      .select("id, status, received_at")
      .in("id", emailIds);

    const candidates = (emails ?? []).slice();
    candidates.sort((a, b) => {
      const aFailed = a.status === "failed" ? 1 : 0;
      const bFailed = b.status === "failed" ? 1 : 0;
      if (aFailed !== bFailed) return bFailed - aFailed;
      return String(b.received_at).localeCompare(String(a.received_at));
    });
    return candidates[0]?.id ?? emailIds[0] ?? null;
  }

  const { data: subjectRows } = await supabase
    .from("ingest_emails")
    .select("id")
    .ilike("subject", `%${ref}%`)
    .order("received_at", { ascending: false })
    .limit(1);

  return subjectRows?.[0]?.id ?? null;
}

export async function reprocessIngestEmailsByReferences(
  supabase: SupabaseClient,
  references: string[]
): Promise<
  { reference: string; emailId?: string; ok: boolean; error?: string; bookingId?: string | null }[]
> {
  const results: {
    reference: string;
    emailId?: string;
    ok: boolean;
    error?: string;
    bookingId?: string | null;
  }[] = [];

  for (const reference of references) {
    const ref = String(reference).trim().toUpperCase();
    if (!ref) continue;

    const emailId = await findIngestEmailIdForReference(supabase, ref);
    if (!emailId) {
      results.push({ reference: ref, ok: false, error: "no ingest email found for reference" });
      continue;
    }

    const one = await reprocessIngestEmailById(supabase, emailId);
    results.push({
      reference: ref,
      emailId,
      ok: one.ok,
      error: one.error ?? undefined,
      bookingId: one.bookingId ?? null,
    });
  }

  return results;
}
