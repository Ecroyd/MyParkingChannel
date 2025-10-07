import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(req: Request, { params }: { params: { tenantId: string } }) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const adminClient = await createAdminClient();
    const { data, error } = await adminClient
      .from('booking_import_errors')
      .select('*')
      .eq('tenant_id', params.tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Failed to fetch import errors:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });

  } catch (error: any) {
    console.error('❌ Error fetching import errors:', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
