import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = getServerSupabase();
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ 
        status: 'error', 
        message: 'Not authenticated',
        setupRequired: false 
      }, { status: 401 });
    }

    // Get user's tenant
    const { data: userTenant, error: tenantError } = await supabase
      .from('user_tenants')
      .select(`
        tenant_id,
        role,
        tenants (
          id,
          name,
          slug,
          timezone
        )
      `)
      .eq('user_id', user.id)
      .single();

    if (tenantError || !userTenant?.tenants) {
      return NextResponse.json({ 
        status: 'error', 
        message: 'No tenant found for user',
        setupRequired: false 
      }, { status: 404 });
    }

    const tenant = userTenant.tenants;

    // Check if the tenant_public_profile table exists by trying to query it
    const { data: profile, error: profileError } = await supabase
      .from('tenant_public_profile')
      .select('id')
      .eq('tenant_id', (tenant as any).id)
      .limit(1);

    if (profileError && profileError.code === 'PGRST116') {
      // Table doesn't exist
      return NextResponse.json({ 
        status: 'error', 
        message: 'Database setup required',
        setupRequired: true,
        tenantId: (tenant as any).id 
      });
    }

    return NextResponse.json({ 
      status: 'ok', 
      message: 'Ready',
      setupRequired: false,
      tenantId: (tenant as any).id,
      tenant: {
        id: (tenant as any).id,
        name: (tenant as any).name,
        slug: (tenant as any).slug,
        timezone: (tenant as any).timezone
      }
    });

  } catch (error: any) {
    console.error('Site SEO status error:', error);
    return NextResponse.json({ 
      status: 'error', 
      message: error.message || 'Internal server error',
      setupRequired: false 
    }, { status: 500 });
  }
}
