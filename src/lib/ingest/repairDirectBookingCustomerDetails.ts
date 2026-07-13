/**
 * Safe repair for direct bookings where customer_name swallowed email/phone.
 *
 * Preview by default. Only high-confidence results are applied.
 * Prefer reparse from original staging/source payload; fallback splits customer_name.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  customerNameLooksContaminated,
  splitCustomerDetailsBlock,
  type CustomerContactDetails,
} from "@/lib/ingest/customerContactDetails";
import { flyparksTextToStaging } from "@/lib/ingest/flyparksTextToStaging";
import { resolveCustomerName } from "@/lib/bookings/normalizeCustomerName";

export const MANUAL_CORRECTION_MARKER = "customer_details_manually_corrected";
export const REPAIR_AUDIT_PREFIX = "[customer_details_repair]";

export type DirectCustomerRepairCandidate = {
  id: string;
  tenant_id: string;
  reference: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  notes: string | null;
  source: string | null;
  external_source: string | null;
};

export type DirectCustomerRepairPreview = {
  booking: DirectCustomerRepairCandidate;
  method: "reparse_source" | "fallback_name_split";
  confidence: "high" | "low";
  skipReason: string | null;
  before: {
    customer_name: string | null;
    customer_email: string | null;
    customer_phone: string | null;
  };
  after: {
    customer_name: string | null;
    customer_email: string | null;
    customer_phone: string | null;
  };
  sourcePayloadAvailable: boolean;
};

function isPlaceholderEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  return /@imports\.local$/i.test(email) || /@myparkingchannel\.app$/i.test(email);
}

function missingContactFields(row: DirectCustomerRepairCandidate): boolean {
  return isPlaceholderEmail(row.customer_email) || !row.customer_phone?.trim();
}

function looksLikeRepairCandidate(row: DirectCustomerRepairCandidate): boolean {
  if (!customerNameLooksContaminated(row.customer_name)) return false;
  if (!missingContactFields(row)) return false;
  const notes = row.notes ?? "";
  if (notes.includes(MANUAL_CORRECTION_MARKER)) return false;
  return true;
}

function extractSourceText(rawJson: unknown): string | null {
  if (!rawJson || typeof rawJson !== "object") return null;
  const raw = rawJson as Record<string, unknown>;
  for (const key of ["source_text", "body_preview", "forwarded_text", "text", "body"] as const) {
    const value = raw[key];
    if (typeof value === "string" && value.trim().length > 40) return value;
  }
  return null;
}

function isHighConfidence(
  before: DirectCustomerRepairCandidate,
  after: CustomerContactDetails & { name: string }
): boolean {
  if (!after.name?.trim()) return false;
  if (customerNameLooksContaminated(after.name)) return false;
  if (after.name === before.customer_name) return false;

  const gainedEmail =
    Boolean(after.email) &&
    (isPlaceholderEmail(before.customer_email) || !before.customer_email);
  const gainedPhone = Boolean(after.phone) && !before.customer_phone?.trim();

  // Must gain at least one missing contact field, or clean a contaminated name while preserving known contacts.
  if (!gainedEmail && !gainedPhone) {
    // Still allow high confidence when we only clean the name but existing email/phone already present
    // — but candidates require missing fields, so this path is low.
    return false;
  }

  // Name should be residual text, not empty and not purely digits.
  if (/^\d+$/.test(after.name)) return false;
  return true;
}

function buildAfterFromContacts(
  before: DirectCustomerRepairCandidate,
  contacts: CustomerContactDetails
): { customer_name: string | null; customer_email: string | null; customer_phone: string | null } {
  const resolved = resolveCustomerName({
    customerName: contacts.name,
    customerEmail: contacts.email ?? (isPlaceholderEmail(before.customer_email) ? null : before.customer_email),
  });

  return {
    customer_name: resolved.name,
    customer_email:
      contacts.email ??
      (isPlaceholderEmail(before.customer_email) ? null : before.customer_email),
    customer_phone: contacts.phone ?? before.customer_phone ?? null,
  };
}

export async function findDirectCustomerRepairCandidates(
  supabase: SupabaseClient,
  opts: { tenantId?: string | null; limit?: number } = {}
): Promise<DirectCustomerRepairCandidate[]> {
  let query = supabase
    .from("bookings")
    .select(
      "id, tenant_id, reference, customer_name, customer_email, customer_phone, notes, source, external_source"
    )
    .or("source.eq.direct,external_source.eq.flyparks_email_text")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 2000);

  if (opts.tenantId) {
    query = query.eq("tenant_id", opts.tenantId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load bookings: ${error.message}`);

  return ((data ?? []) as DirectCustomerRepairCandidate[]).filter(looksLikeRepairCandidate);
}

async function loadSourcePayloadForBooking(
  supabase: SupabaseClient,
  booking: DirectCustomerRepairCandidate
): Promise<string | null> {
  const { data: stagingRows, error } = await supabase
    .from("booking_import_staging")
    .select("raw_json, reference, dedupe_key")
    .eq("tenant_id", booking.tenant_id)
    .eq("reference", booking.reference)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.warn(`staging lookup failed for ${booking.reference}: ${error.message}`);
  }

  for (const row of stagingRows ?? []) {
    const text = extractSourceText(row.raw_json);
    if (text) return text;
  }

  // Fall back to ingest parses by reference guess.
  const { data: parses } = await supabase
    .from("ingest_email_parses")
    .select("forwarded_text, booking_reference_guess")
    .eq("booking_reference_guess", booking.reference)
    .not("forwarded_text", "is", null)
    .limit(3);

  for (const parse of parses ?? []) {
    const text = typeof parse.forwarded_text === "string" ? parse.forwarded_text : null;
    if (text && text.trim().length > 40) return text;
  }

  return null;
}

export async function previewDirectCustomerRepair(
  supabase: SupabaseClient,
  booking: DirectCustomerRepairCandidate
): Promise<DirectCustomerRepairPreview> {
  const before = {
    customer_name: booking.customer_name,
    customer_email: booking.customer_email,
    customer_phone: booking.customer_phone,
  };

  if ((booking.notes ?? "").includes(MANUAL_CORRECTION_MARKER)) {
    return {
      booking,
      method: "fallback_name_split",
      confidence: "low",
      skipReason: "manually_corrected",
      before,
      after: before,
      sourcePayloadAvailable: false,
    };
  }

  const sourceText = await loadSourcePayloadForBooking(supabase, booking);
  if (sourceText) {
    const staging = flyparksTextToStaging(sourceText);
    const after = {
      customer_name: staging.customer_name,
      customer_email: staging.customer_email ?? (isPlaceholderEmail(booking.customer_email) ? null : booking.customer_email),
      customer_phone: staging.customer_phone ?? booking.customer_phone,
    };
    const confidence = isHighConfidence(booking, {
      name: after.customer_name ?? "",
      email: after.customer_email,
      phone: after.customer_phone,
    })
      ? "high"
      : "low";

    return {
      booking,
      method: "reparse_source",
      confidence,
      skipReason: confidence === "high" ? null : "low_confidence_reparse",
      before,
      after,
      sourcePayloadAvailable: true,
    };
  }

  const split = splitCustomerDetailsBlock(booking.customer_name);
  const after = buildAfterFromContacts(booking, split);
  const confidence = isHighConfidence(booking, {
    name: after.customer_name ?? "",
    email: after.customer_email,
    phone: after.customer_phone,
  })
    ? "high"
    : "low";

  return {
    booking,
    method: "fallback_name_split",
    confidence,
    skipReason: confidence === "high" ? null : "low_confidence_fallback",
    before,
    after,
    sourcePayloadAvailable: false,
  };
}

export async function previewDirectCustomerRepairs(
  supabase: SupabaseClient,
  opts: { tenantId?: string | null; limit?: number } = {}
): Promise<DirectCustomerRepairPreview[]> {
  const candidates = await findDirectCustomerRepairCandidates(supabase, opts);
  const previews: DirectCustomerRepairPreview[] = [];
  for (const candidate of candidates) {
    previews.push(await previewDirectCustomerRepair(supabase, candidate));
  }
  return previews;
}

function buildAuditNote(preview: DirectCustomerRepairPreview): string {
  const stamp = new Date().toISOString();
  return `${REPAIR_AUDIT_PREFIX} ${stamp} method=${preview.method} before_name=${JSON.stringify(preview.before.customer_name)} after_name=${JSON.stringify(preview.after.customer_name)} email=${JSON.stringify(preview.after.customer_email)} phone=${JSON.stringify(preview.after.customer_phone)}`;
}

export async function applyDirectCustomerRepair(
  supabase: SupabaseClient,
  preview: DirectCustomerRepairPreview,
  opts: { confirmManual?: boolean } = {}
): Promise<{ ok: boolean; error?: string }> {
  if (preview.confidence !== "high") {
    return { ok: false, error: preview.skipReason ?? "low_confidence" };
  }
  if ((preview.booking.notes ?? "").includes(MANUAL_CORRECTION_MARKER) && !opts.confirmManual) {
    return { ok: false, error: "manually_corrected" };
  }

  const audit = buildAuditNote(preview);
  const notes = [preview.booking.notes?.trim(), audit].filter(Boolean).join("\n");

  const { error } = await supabase
    .from("bookings")
    .update({
      customer_name: preview.after.customer_name,
      customer_email: preview.after.customer_email,
      customer_phone: preview.after.customer_phone,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", preview.booking.id)
    .eq("tenant_id", preview.booking.tenant_id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
