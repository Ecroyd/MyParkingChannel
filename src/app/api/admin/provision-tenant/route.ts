// src/app/api/admin/provision-tenant/route.ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

interface ProvisionRequest {
  tenant: {
    name: string;
    slug: string;
    timezone: string;
    default_capacity?: number;
  };
  user: {
    email: string;
    password: string;
  };
  site?: {
    slug?: string; // Optional different site slug
  };
}

export async function POST(req: Request) {
  try {
    const body: ProvisionRequest = await req.json();
    const { tenant, user, site } = body;

    // Validate required fields
    if (!tenant?.name || !tenant?.slug || !user?.email || !user?.password) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'Missing required fields' } },
        { status: 400 }
      );
    }

    const sb = await createAdminClient();
    console.log('Starting tenant provisioning:', { tenantName: tenant.name, userEmail: user.email });

    // Step 1: Create user via Supabase Auth Admin API
    console.log('Creating user account...');
    const { data: userRes, error: userErr } = await sb.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
    });

    if (userErr || !userRes?.user?.id) {
      console.error('User creation failed:', userErr);
      throw userErr ?? new Error('User creation failed');
    }
    const ownerUserId = userRes.user.id;
    console.log('User created successfully:', ownerUserId);

    // Step 2: Create tenant
    console.log('Creating tenant...');
    const { data: tenantRes, error: tenantErr } = await sb
      .from('tenants')
      .insert({
        name: tenant.name,
        slug: tenant.slug,
        timezone: tenant.timezone || 'Europe/London',
        default_capacity: tenant.default_capacity || 100,
        status: 'active',
      })
      .select('id')
      .single();

    if (tenantErr || !tenantRes?.id) {
      console.error('Tenant creation failed:', tenantErr);
      // Rollback: delete the user we just created
      await sb.auth.admin.deleteUser(ownerUserId);
      throw tenantErr ?? new Error('Tenant creation failed');
    }
    const tenantId = tenantRes.id;
    console.log('Tenant created successfully:', tenantId);

    // Step 3: Link user to tenant
    console.log('Creating user_tenants relationship...');
    const { error: linkErr } = await sb
      .from('user_tenants')
      .insert({
        tenant_id: tenantId,
        user_id: ownerUserId,
        role: 'owner',
        is_default: true,
      });

    if (linkErr) {
      console.error('User-tenant linking failed:', linkErr);
      // Rollback: delete tenant and user
      await sb.from('tenants').delete().eq('id', tenantId);
      await sb.auth.admin.deleteUser(ownerUserId);
      throw linkErr;
    }
    console.log('User-tenant relationship created');

    // Step 4: Create site (with different slug if needed)
    const siteSlug = site?.slug || tenant.slug;
    console.log('Creating site...');
    const { error: siteErr } = await sb
      .from('sites')
      .insert({
        tenant_id: tenantId,
        slug: siteSlug,
        status: 'draft',
        template: 'default',
      });

    if (siteErr) {
      console.error('Site creation failed:', siteErr);
      // Rollback: delete tenant, user_tenants, and user
      await sb.from('user_tenants').delete().eq('tenant_id', tenantId);
      await sb.from('tenants').delete().eq('id', tenantId);
      await sb.auth.admin.deleteUser(ownerUserId);
      throw siteErr;
    }
    console.log('Site created successfully');

    // Step 5: Populate default rows
    console.log('Creating default tenant data...');
    
    // Create tenant_branding
    await sb.from('tenant_branding').insert({
      tenant_id: tenantId,
      app_name: tenant.name,
      short_name: tenant.name.split(' ')[0] || tenant.name,
      theme_color: '#1e40af',
      background_color: '#ffffff',
    });

    // Create tenant_public_profile
    await sb.from('tenant_public_profile').insert({
      tenant_id: tenantId,
      business_name: tenant.name,
      email: user.email,
      is_active: true,
      status: 'active',
    });

    // Create tenant_pricing
    await sb.from('tenant_pricing').insert({
      tenant_id: tenantId,
      daily_rate: 7.0,
      currency: 'GBP',
    });

    // Create tenant_secrets (empty for now)
    await sb.from('tenant_secrets').insert({
      tenant_id: tenantId,
      scope: 'general',
      key: 'initialized',
      value_ciphertext: 'true',
    });

    console.log('Default tenant data created successfully');

    // Step 6: Send email (optional)
    try {
      // TODO: Implement email sending
      console.log('Email notification would be sent to:', user.email);
    } catch (emailError) {
      console.warn('Email sending failed (non-critical):', emailError);
    }

    console.log('Tenant provisioning completed successfully');
    return NextResponse.json({
      success: true,
      tenantId,
      ownerUserId,
      siteSlug,
      message: `Tenant "${tenant.name}" and user "${user.email}" created successfully`,
    }, { status: 201 });

  } catch (err: any) {
    console.error('Provisioning error:', err);
    return NextResponse.json({
      error: {
        code: err?.code ?? 'PROVISION_FAILED',
        message: err?.message ?? 'Failed to provision tenant',
      },
    }, { status: 500 });
  }
}
