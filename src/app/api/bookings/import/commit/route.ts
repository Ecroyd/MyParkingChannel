import { NextResponse } from 'next/server';
import { getServerSupabase, supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = await getServerSupabase();
    const admin = supabaseAdmin();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
      return NextResponse.json({ error: 'Authentication failed', details: authError.message }, { status: 401 });
    }
    
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { tenantId } = body;
    
    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
    }

    // Check user's tenant roles
    const { data: userTenants, error: userTenantsError } = await admin
      .from('user_tenants')
      .select('tenant_id, role, is_default')
      .eq('user_id', user.id);
      
    if (userTenantsError) {
      return NextResponse.json({ error: 'Failed to check user permissions', details: userTenantsError.message }, { status: 500 });
    }
    
    // Check if user has access to this specific tenant
    const userTenant = userTenants?.find(ut => ut.tenant_id === tenantId);
    
    if (!userTenant) {
      return NextResponse.json({ 
        error: 'Forbidden', 
        details: `User does not have access to tenant ${tenantId}`,
        userTenants: userTenants || []
      }, { status: 403 });
    }
    
    // Check if user has required role
    const allowedRoles = ['owner', 'admin', 'member'];
    if (!allowedRoles.includes(userTenant.role)) {
      return NextResponse.json({ 
        error: 'Forbidden', 
        details: `User has role '${userTenant.role}' but needs one of: ${allowedRoles.join(', ')}`,
        userTenant
      }, { status: 403 });
    }

    // First, let's check what data is in the staging table
    console.log('🔍 IMPORT_COMMIT: Starting commit process...', { tenantId, userId: user.id });
    
    const { data: stagingData, error: stagingError } = await admin
      .from('booking_import_staging')
      .select('id, tenant_id, status, raw_payload')
      .eq('tenant_id', tenantId)
      .eq('status', 'pending');
    
    console.log('🔍 IMPORT_COMMIT: Staging table query result:', { 
      count: stagingData?.length || 0, 
      stagingError: stagingError?.message,
      hasData: !!stagingData,
      sampleId: stagingData?.[0]?.id,
      samplePayload: stagingData?.[0]?.raw_payload ? 'exists' : 'missing'
    });

    // Execute commit as service role via security definer RPC
    console.log('🔍 IMPORT_COMMIT: Calling RPC function...', { 
      functionName: 'booking_import_commit',
      p_tenant_id: tenantId,
      p_actor: user.id 
    });
    
    const { data, error } = await admin.rpc('booking_import_commit', {
      p_tenant_id: tenantId,
      p_actor: user.id,
    });
    
    console.log('🔍 IMPORT_COMMIT: RPC function result:', { 
      hasData: !!data,
      dataLength: data?.length || 0,
      error: error?.message,
      result: data?.[0]
    });

    if (error) {
      console.error('IMPORT_COMMIT_RPC_ERROR:', error);
      return NextResponse.json({ error: error.message, details: error }, { status: 400 });
    }

    // Log success with details
    const result = data?.[0] || { processed: 0, inserted: 0, failed: 0 };
    console.log('✅ IMPORT_COMMIT_SUCCESS:', {
      tenantId,
      userId: user.id,
      processed: result.processed,
      inserted: result.inserted,
      failed: result.failed
    });

    return NextResponse.json({ 
      ok: true, 
      result: data,
      summary: {
        processed: result.processed,
        inserted: result.inserted,
        failed: result.failed
      }
    });
  } catch (e: any) {
    console.error('❌ IMPORT_COMMIT_FATAL:', e);
    return NextResponse.json({ error: e?.message ?? 'Unknown error', details: e }, { status: 500 });
  }
}