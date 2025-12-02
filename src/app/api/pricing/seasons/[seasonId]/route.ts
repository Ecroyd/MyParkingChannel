import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, createAdminClient } from '@/lib/supabase/server';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ seasonId: string }> }
) {
  const { seasonId } = await params;
  
  const supabase = await getServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get user's tenant
  const adminSupabase = await createAdminClient();
  const { data: userTenants, error: tenantError } = await adminSupabase
    .from('user_tenants')
    .select('tenant_id, role, is_default')
    .eq('user_id', user.id);

  if (tenantError || !userTenants || userTenants.length === 0) {
    return NextResponse.json({ error: 'No tenant access found' }, { status: 404 });
  }

  const userTenant = userTenants.find((ut: any) => ut.is_default) || userTenants[0];
  const tenantId = userTenant.tenant_id;

  const body = await req.json();
  
  const { data, error } = await adminSupabase
    .from('seasons')
    .update({
      name: body.name,
      code: body.code,
      color: body.color,
      updated_at: new Date().toISOString(),
    })
    .eq('id', seasonId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
    
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  
  return NextResponse.json({ data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ seasonId: string }> }
) {
  const { seasonId } = await params;
  
  const supabase = await getServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get user's tenant
  const adminSupabase = await createAdminClient();
  const { data: userTenants, error: tenantError } = await adminSupabase
    .from('user_tenants')
    .select('tenant_id, role, is_default')
    .eq('user_id', user.id);

  if (tenantError || !userTenants || userTenants.length === 0) {
    return NextResponse.json({ error: 'No tenant access found' }, { status: 404 });
  }

  const userTenant = userTenants.find((ut: any) => ut.is_default) || userTenants[0];
  const tenantId = userTenant.tenant_id;

  // Check if season has pricing rules
  const { data: rules, error: rulesError } = await adminSupabase
    .from('pricing_rules')
    .select('id')
    .eq('season_id', seasonId)
    .eq('tenant_id', tenantId)
    .limit(1);

  if (rulesError) {
    return NextResponse.json({ error: rulesError.message }, { status: 400 });
  }

  if (rules && rules.length > 0) {
    return NextResponse.json(
      { error: 'Cannot delete season: it still has pricing rules' },
      { status: 400 }
    );
  }

  // Delete season ranges first (cascade should handle this, but being explicit)
  await adminSupabase
    .from('season_ranges')
    .delete()
    .eq('season_id', seasonId)
    .eq('tenant_id', tenantId);

  // Delete season
  const { error } = await adminSupabase
    .from('seasons')
    .delete()
    .eq('id', seasonId)
    .eq('tenant_id', tenantId);
    
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  
  return NextResponse.json({ success: true });
}

