// src/app/api/admin/tenants/create/route.ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    
    // Handle both old and new payload formats
    let name, slug, ownerEmail, ownerPassword, timezone, capacity;
    
    if (payload.tenant && payload.owner) {
      // New format: { tenant: {...}, owner: {...} }
      name = payload.tenant.name;
      slug = payload.tenant.slug;
      timezone = payload.tenant.timezone || 'Europe/London';
      capacity = payload.tenant.capacity || 0;
      ownerEmail = payload.owner.email;
      ownerPassword = payload.owner.password;
    } else {
      // Old format: { name, slug, ownerEmail, ownerPassword }
      name = payload.name;
      slug = payload.slug;
      ownerEmail = payload.ownerEmail;
      ownerPassword = payload.ownerPassword;
      timezone = 'Europe/London';
      capacity = 0;
    }

    if (!name || !ownerEmail) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Missing required fields: name and ownerEmail' } }, { status: 400 });
    }

    const sb = await createAdminClient();

    let ownerUserId: string;

    if (ownerPassword) {
      // 1. Create Auth user with password
      const { data: userRes, error: userErr } = await sb.auth.admin.createUser({
        email: ownerEmail,
        password: ownerPassword,
        email_confirm: true,
      });
      if (userErr || !userRes?.user?.id) throw userErr ?? new Error('User creation failed');
      ownerUserId = userRes.user.id;
    } else {
      // 1. Create Auth user without password (invitation)
      const { data: userRes, error: userErr } = await sb.auth.admin.createUser({
        email: ownerEmail,
        email_confirm: false,
      });
      if (userErr || !userRes?.user?.id) throw userErr ?? new Error('User creation failed');
      ownerUserId = userRes.user.id;
    }

    // 2. Create tenant
    const { data: tenantRes, error: tenantErr } = await sb
      .from('tenants')
      .insert({
        name,
        slug: slug || null, // Allow null slug for auto-generation
        timezone,
        default_capacity: capacity,
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
      slug: slug || name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
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
