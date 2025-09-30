import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!tenantId || !start || !end) {
      return NextResponse.json(
        { error: "Missing required parameters: tenantId, start, end" },
        { status: 400 }
      );
    }

    const supabase = await getServerSupabase();
    const adminSupabase = await createAdminClient();

    // Verify user has access to this tenant
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userTenant } = await adminSupabase
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .single();

    if (!userTenant) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Use admin client to bypass RLS and tenant access checks in functions
    const { data, error } = await adminSupabase.rpc("analytics_summary", {
      p_tenant_id: tenantId,
      p_start: start,
      p_end: end,
    });

    if (error) {
      console.error("Summary analytics error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data?.[0] || {} });
  } catch (error: any) {
    console.error("Summary analytics error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
