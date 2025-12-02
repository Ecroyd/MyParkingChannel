import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, createAdminClient } from '@/lib/supabase/server';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ seasonId: string; rangeId: string }> }
) {
  const { seasonId, rangeId } = await params;
  
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

  const { error } = await adminSupabase
    .from('season_ranges')
    .delete()
    .eq('id', rangeId)
    .eq('season_id', seasonId)
    .eq('tenant_id', tenantId);
    
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  
  return NextResponse.json({ success: true });
}

