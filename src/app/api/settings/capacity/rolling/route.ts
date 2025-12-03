import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server-admin'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const tenantId = url.searchParams.get('tenant_id')
  if (!tenantId) return NextResponse.json({ error: 'tenant_id required' }, { status: 400 })

  const supabase = await getServerSupabase()
  
  try {
    // Get user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use admin client to bypass RLS issues
    const adminClient = await createAdminClient();
    const { data, error } = await adminClient
      .from('tenant_settings')
      .select('rolling_capacity_months, default_daily_capacity')
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (error) {
      console.error("Tenant settings query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    // Return defaults if no row exists
    return NextResponse.json({ 
      rolling_capacity_months: data?.rolling_capacity_months ?? 12,
      default_daily_capacity: data?.default_daily_capacity ?? 250
    })
  } catch (error) {
    console.error("Rolling capacity GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null) as { 
    tenant_id?: string; 
    rolling_capacity_months?: number;
    default_daily_capacity?: number;
  } | null
  
  if (!body?.tenant_id || body.rolling_capacity_months == null || body.default_daily_capacity == null)
    return NextResponse.json({ 
      error: 'tenant_id, rolling_capacity_months, and default_daily_capacity required' 
    }, { status: 400 })

  const supabase = await getServerSupabase()
  
  try {
    // Get user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use admin client to bypass RLS issues
    const adminClient = await createAdminClient();
    
    // Upsert tenant_settings (insert or update)
    const { error } = await adminClient
      .from('tenant_settings')
      .upsert({
        tenant_id: body.tenant_id,
        rolling_capacity_months: body.rolling_capacity_months,
        default_daily_capacity: body.default_daily_capacity,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'tenant_id'
      })

    if (error) {
      console.error("Tenant settings upsert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Rolling capacity PUT error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

