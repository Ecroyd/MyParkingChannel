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

    // Check user's tenant roles
    console.log('🔍 IMPORT_COMMIT: Checking user tenant roles...');
    const { data: allowed, error: roleError } = await admin.rpc('has_tenant_role', {
      p_tenant_id: tenantId,
      p_roles: ['owner','admin'],
    });
    
    if (roleError) {
      console.error('❌ IMPORT_COMMIT: Role check error:', roleError);
      return NextResponse.json({ error: 'Role check failed', details: roleError.message }, { status: 500 });
    }
    
    console.log('🔍 IMPORT_COMMIT: Role check result:', { allowed, roleError });
    
    if (!allowed) {
      console.error('❌ IMPORT_COMMIT: User does not have required role for tenant:', { userId: user.id, tenantId });
      
      // Let's also check what roles the user actually has
      const { data: userTenants, error: userTenantsError } = await admin
        .from('user_tenants')
        .select('tenant_id, role, is_default')
        .eq('user_id', user.id);
        
      console.log('🔍 IMPORT_COMMIT: User tenant memberships:', { userTenants, userTenantsError });
      
      return NextResponse.json({ 
        error: 'Forbidden', 
        details: `User ${user.id} does not have owner/admin role for tenant ${tenantId}`,
        userTenants: userTenants || []
      }, { status: 403 });
    }

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