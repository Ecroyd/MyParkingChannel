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
      .from('tenants')
      .select('id, default_capacity')
      .eq('id', tenantId)
      .single()

    if (error) {
      console.error("Tenants query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
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

    // Use admin client to bypass RLS issues
    const adminClient = await createAdminClient();
    const { error } = await adminClient
      .from('tenants')
      .update({ default_capacity: body.default_capacity })
      .eq('id', body.tenant_id)

    if (error) {
      console.error("Tenants update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Capacity default PUT error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

