import { NextResponse } from 'next/server';
import { getServerSupabase, supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    console.log('🔍 IMPORT_COMMIT: Starting commit process...');
    
    const supabase = await getServerSupabase();
    const admin = supabaseAdmin();

    console.log('🔍 IMPORT_COMMIT: Getting user authentication...');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
      console.error('❌ IMPORT_COMMIT: Auth error:', authError);
      return NextResponse.json({ error: 'Authentication failed', details: authError.message }, { status: 401 });
    }
    
    if (!user) {
      console.error('❌ IMPORT_COMMIT: No user found');
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    
    console.log('✅ IMPORT_COMMIT: User authenticated:', { userId: user.id, email: user.email });

    const body = await req.json();
    console.log('🔍 IMPORT_COMMIT: Request body:', body);
    
    const { tenantId } = body;
    if (!tenantId) {
      console.error('❌ IMPORT_COMMIT: No tenantId provided');
      return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
    }
    
    console.log('✅ IMPORT_COMMIT: Tenant ID provided:', tenantId);

    // Check user's tenant roles directly
    console.log('🔍 IMPORT_COMMIT: Checking user tenant roles...');
    const { data: userTenants, error: userTenantsError } = await admin
      .from('user_tenants')
      .select('tenant_id, role, is_default')
      .eq('user_id', user.id);
      
    console.log('🔍 IMPORT_COMMIT: User tenant memberships:', { userTenants, userTenantsError });
    
    if (userTenantsError) {
      console.error('❌ IMPORT_COMMIT: Error fetching user tenants:', userTenantsError);
      return NextResponse.json({ error: 'Failed to check user permissions', details: userTenantsError.message }, { status: 500 });
    }
    
    // Check if user has access to this specific tenant
    const userTenant = userTenants?.find(ut => ut.tenant_id === tenantId);
    console.log('🔍 IMPORT_COMMIT: User tenant access:', { userTenant, tenantId });
    
    if (!userTenant) {
      console.error('❌ IMPORT_COMMIT: User does not have access to tenant:', { userId: user.id, tenantId, userTenants });
      return NextResponse.json({ 
        error: 'Forbidden', 
        details: `User ${user.id} does not have access to tenant ${tenantId}`,
        userTenants: userTenants || []
      }, { status: 403 });
    }
    
    // Check if user has required role (owner, admin, or any role for now)
    const allowedRoles = ['owner', 'admin', 'member']; // Allow any role for now
    if (!allowedRoles.includes(userTenant.role)) {
      console.error('❌ IMPORT_COMMIT: User does not have required role:', { userId: user.id, tenantId, role: userTenant.role });
      return NextResponse.json({ 
        error: 'Forbidden', 
        details: `User ${user.id} has role '${userTenant.role}' but needs one of: ${allowedRoles.join(', ')}`,
        userTenant
      }, { status: 403 });
    }
    
    console.log('✅ IMPORT_COMMIT: User has required access:', { userId: user.id, tenantId, role: userTenant.role });

    console.log('✅ IMPORT_COMMIT: User has required role, proceeding with commit...');

    // Execute commit as service role via security definer RPC
    console.log('🔍 IMPORT_COMMIT: Calling booking_import_commit RPC...');
    const { data, error } = await admin.rpc('booking_import_commit', {
      p_tenant_id: tenantId,
      p_actor: user.id,
    });

    if (error) {
      console.error('❌ IMPORT_COMMIT: RPC error:', error);
      return NextResponse.json({ error: error.message, details: error }, { status: 400 });
    }

    console.log('✅ IMPORT_COMMIT: RPC completed successfully:', data);
    return NextResponse.json({ ok: true, result: data });
  } catch (e: any) {
    console.error('❌ IMPORT_COMMIT_FATAL:', e);
    return NextResponse.json({ error: e?.message ?? 'Unknown error', details: e }, { status: 500 });
  }
}