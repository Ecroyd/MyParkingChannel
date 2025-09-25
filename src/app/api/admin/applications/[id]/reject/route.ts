import { createServerClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/guards";
import { sendAdminEmail, sendEmail } from "@/lib/email";
import { NextResponse } from "next/server";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { sb } = await requirePlatformAdmin();
  const { id } = await params;

  const { data: appRow } = await sb
    .from("tenant_applications")
    .select("applicant_email, applicant_name, company_name")
    .eq("id", id)
    .maybeSingle();

  const { error } = await sb
    .from("tenant_applications")
    .update({ status: "rejected", reviewed_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  try {
    if (appRow?.applicant_email) {
      await sendEmail(
        appRow.applicant_email,
        "Your application status",
        `<p>Hi ${appRow.applicant_name ?? ""}, thanks for applying. Unfortunately this one wasn't a match right now.</p>`
      );
    }
    await sendAdminEmail("Application REJECTED", `<p>Rejected: ${appRow?.applicant_email ?? id}</p>`);
  } catch (_) {}

  return NextResponse.redirect(
    new URL("/admin/applications", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002")
  );
}
