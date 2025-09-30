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

    // Verify user has access to this tenant
    const { data: userTenant, error: accessError } = await supabase
      .from("user_tenants")
      .select("tenant_id, role")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .single();

    if (accessError || !userTenant) {
      // Fallback: Use admin client to check if user_tenants record exists
      const adminClient = await createAdminClient();
      const { data: adminUserTenant, error: adminAccessError } = await adminClient
        .from("user_tenants")
        .select("tenant_id, role")
        .eq("user_id", user.id)
        .eq("tenant_id", tenantId)
        .single();
      
      if (adminAccessError || !adminUserTenant) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    const { data, error } = await supabase
      .from('tenants')
      .select('id, default_capacity')
      .eq('id', tenantId)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ default_capacity: data?.default_capacity ?? null })
  } catch (error) {
    console.error("Capacity default GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null) as { tenant_id?: string; default_capacity?: number } | null
  if (!body?.tenant_id || body.default_capacity == null)
    return NextResponse.json({ error: 'tenant_id and default_capacity required' }, { status: 400 })

  const supabase = await getServerSupabase()
  
  try {
    // Get user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to this tenant
    const { data: userTenant, error: accessError } = await supabase
      .from("user_tenants")
      .select("tenant_id, role")
      .eq("user_id", user.id)
      .eq("tenant_id", body.tenant_id)
      .single();

    if (accessError || !userTenant) {
      // Fallback: Use admin client to check if user_tenants record exists
      const adminClient = await createAdminClient();
      const { data: adminUserTenant, error: adminAccessError } = await adminClient
        .from("user_tenants")
        .select("tenant_id, role")
        .eq("user_id", user.id)
        .eq("tenant_id", body.tenant_id)
        .single();
      
      if (adminAccessError || !adminUserTenant) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    const { error } = await supabase
      .from('tenants')
      .update({ default_capacity: body.default_capacity })
      .eq('id', body.tenant_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Capacity default PUT error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

