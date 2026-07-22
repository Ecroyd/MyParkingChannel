import { NextResponse } from "next/server";
import { requireSeoAdminContext } from "@/lib/seo/admin-context";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { invalidateSiteSeoCaches } from "@/lib/seo/cache";

/**
 * Local Business tab writes to tenant_public_profile (authoritative).
 * Does not duplicate into another table.
 */
export async function PUT(req: Request) {
  const auth = await requireSeoAdminContext();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { ctx } = auth;
  const body = await req.json();

  const allowed = [
    "business_name",
    "alternative_name",
    "short_tagline",
    "business_description",
    "about_text",
    "phone",
    "email",
    "website",
    "address",
    "county",
    "country",
    "latitude",
    "longitude",
    "what3words",
    "hours",
    "price_range",
    "airports",
    "features",
    "facebook_url",
    "twitter_url",
    "instagram_url",
    "linkedin_url",
    "external_review_links",
    "logo_url",
    "faq",
  ] as const;

  const patch: Record<string, unknown> = {
    tenant_id: ctx.tenantId,
    updated_at: new Date().toISOString(),
  };

  for (const key of allowed) {
    if (body[key] !== undefined) patch[key] = body[key];
  }

  // Compatibility: keep contact_* mirrors if phone/email/address provided
  if (body.phone !== undefined) patch.contact_phone = body.phone;
  if (body.email !== undefined) patch.contact_email = body.email;
  if (body.address?.street || body.address?.city) {
    patch.contact_address = body.address?.street || body.address?.streetAddress || null;
  }

  if (!patch.business_name) {
    // upsert requires business_name NOT NULL — load existing if missing
    const adminPeek = createAdminClient();
    const { data: existing } = await adminPeek
      .from("tenant_public_profile")
      .select("business_name")
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    patch.business_name = existing?.business_name || ctx.tenantName;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tenant_public_profile")
    .upsert(patch, { onConflict: "tenant_id" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  invalidateSiteSeoCaches({ siteId: ctx.siteId, tenantId: ctx.tenantId });
  return NextResponse.json({ success: true, data });
}
