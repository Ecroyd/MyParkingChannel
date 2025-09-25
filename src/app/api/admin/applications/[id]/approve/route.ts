import { createServerClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/guards";
import { sendAdminEmail, sendEmail } from "@/lib/email";
import { NextResponse } from "next/server";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { sb } = await requirePlatformAdmin();
    const { id } = await params;
    

    // Get applicant details first
    const { data: appRow, error: appErr } = await sb
      .from("tenant_applications")
      .select("applicant_email, applicant_name, company_name")
      .eq("id", id)
      .maybeSingle();

    if (appErr || !appRow) {
      return NextResponse.json({ error: appErr?.message ?? "Application not found" }, { status: 404 });
    }

    // Create tenant + link owner using direct approach instead of RPC
    
    // Generate slug
    const baseName = appRow.company_name || appRow.applicant_name || appRow.applicant_email;
    let finalSlug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!finalSlug) finalSlug = 'tenant';
    
    // Make slug unique
    let counter = 1;
    let uniqueSlug = finalSlug;
    while (true) {
      const { data: existing } = await sb.from('tenants').select('id').eq('slug', uniqueSlug).maybeSingle();
      if (!existing) break;
      uniqueSlug = `${finalSlug}-${counter}`;
      counter++;
    }
    
        // Create tenant
        const { data: newTenant, error: tenantError } = await sb
          .from('tenants')
          .insert({
            name: baseName,
            slug: uniqueSlug
          })
          .select()
          .single();
    
    if (tenantError) {
      return NextResponse.json({ error: tenantError.message }, { status: 400 });
    }
    
    // Find or create owner user
    let ownerId = (await sb.auth.getUser()).data.user?.id;
    const { data: existingUser } = await sb.auth.admin.listUsers();
    const foundUser = existingUser.users.find(u => u.email === appRow.applicant_email);
    if (foundUser) {
      ownerId = foundUser.id;
    }
    
        // Create user_tenants relationship
        const { error: userTenantError } = await sb
          .from('user_tenants')
          .insert({
            user_id: ownerId,
            tenant_id: newTenant.id,
            role: 'owner'
          });
    
    if (userTenantError) {
      return NextResponse.json({ error: userTenantError.message }, { status: 400 });
    }
    
    // Update application status
    const { error: updateError } = await sb
      .from('tenant_applications')
      .update({
        status: 'approved',
        reviewed_by: (await sb.auth.getUser()).data.user?.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', id);
    
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

  // Invite user to Supabase Auth (so Supabase sends them a signup/confirm email)
  try {
    await sb.auth.admin.inviteUserByEmail(appRow.applicant_email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002"}/login`,
    });
  } catch (_) {}

  // Emails
  try {
    await sendEmail(
      appRow.applicant_email,
      "Your application was approved 🎉",
      `<p>Hi ${appRow.applicant_name ?? ""}, your account is ready. Check your email for a login invite.</p>`
    );
    await sendAdminEmail(
      "Application APPROVED",
      `<p>Approved: ${appRow.applicant_email} (${appRow.company_name ?? "—"})</p>`
    );
  } catch (_) {}

    return NextResponse.redirect(
      new URL("/admin/applications", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002")
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
