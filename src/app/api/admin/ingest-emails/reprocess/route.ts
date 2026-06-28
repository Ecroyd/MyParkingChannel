import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireAdminApi } from "@/lib/ingest/requireAdminApi";
import {
  reprocessIngestEmailById,
  reprocessIngestEmailsByReferences,
} from "@/lib/ingest/reprocessIngestEmail";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/ingest-emails/reprocess
 * Body: { emailId?: string; references?: string[]; emailIds?: string[] }
 */
export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  let body: { emailId?: string; references?: string[]; emailIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  if (body.references?.length) {
    const refs = body.references.map((r) => String(r).trim().toUpperCase()).filter(Boolean);
    const results = await reprocessIngestEmailsByReferences(supabase, refs);
    return NextResponse.json({
      ok: results.every((r) => r.ok),
      results,
    });
  }

  if (body.emailIds?.length) {
    const results: {
      emailId: string;
      ok: boolean;
      error?: string | null;
      bookingId?: string | null;
    }[] = [];
    for (const emailId of body.emailIds) {
      const one = await reprocessIngestEmailById(supabase, emailId);
      results.push({ emailId, ...one });
    }
    return NextResponse.json({
      ok: results.every((r) => r.ok),
      results,
    });
  }

  const emailId = body?.emailId;
  if (!emailId) {
    return NextResponse.json({ ok: false, error: "missing emailId, emailIds, or references" }, { status: 400 });
  }

  const result = await reprocessIngestEmailById(supabase, emailId);
  return NextResponse.json({ emailId, ...result });
}
