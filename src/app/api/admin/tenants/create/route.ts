// src/app/api/admin/tenants/create/route.ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

export async function POST(req: Request) {
  try {
    const { name, slug, ownerEmail, ownerPassword } = await req.json();

    if (!name || !slug || !ownerEmail || !ownerPassword) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Missing fields' } }, { status: 400 });
    }

    const sb = createAdminClient();

    // 1. Create Auth user
    const { data: userRes, error: userErr } = await sb.auth.admin.createUser({
      email: ownerEmail,
      password: ownerPassword,
      email_confirm: true,
    });
    if (userErr || !userRes?.user?.id) throw userErr ?? new Error('User creation failed');
    const ownerUserId = userRes.user.id;

    // 2. Create tenant
    const { data: tenantRes, error: tenantErr } = await sb
      .from('tenants')
      .insert({
        name,
        slug,
        timezone: 'Europe/London',
        status: 'active',
      })
      .select('id')
      .single();
    if (tenantErr || !tenantRes?.id) throw tenantErr ?? new Error('Tenant creation failed');
    const tenantId = tenantRes.id;

    // 3. Link user to tenant
    const { error: linkErr } = await sb
      .from('user_tenants')
      .insert({
        tenant_id: tenantId,
        user_id: ownerUserId,
        role: 'owner',
        is_default: true,
      });
    if (linkErr) throw linkErr;

    // 4. Create site
    await sb.from('sites').insert({
      tenant_id: tenantId,
      slug,
      status: 'draft',
      template: 'default',
    });

    // 5. Create tenant_branding
    await sb.from('tenant_branding').insert({
      tenant_id: tenantId,
      app_name: name,
      short_name: name.split(' ')[0] ?? name,
    });

    // 6. Create tenant_public_profile
    await sb.from('tenant_public_profile').insert({
      tenant_id: tenantId,
      business_name: name,
      email: ownerEmail,
      is_active: true,
    });

    return NextResponse.json({ tenantId, ownerUserId }, { status: 200 });
  } catch (err: any) {
    console.error('Provisioning error:', err);
    return NextResponse.json({
      error: {
        code: err?.code ?? 'PROVISION_FAILED',
        message: err?.message ?? 'Failed to create tenant',
      },
    }, { status: 500 });
  }
}