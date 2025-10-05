import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const admin = supabaseAdmin();
    const body = await req.json();
    const { tenantId } = body;
    
    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
    }
    
    // Call the debug function
    const { data, error } = await admin.rpc('debug_import_commit', {
      p_tenant_id: tenantId,
      p_actor: '00000000-0000-0000-0000-000000000000' // dummy actor for testing
    });
    
    if (error) {
      return NextResponse.json({ error: error.message, details: error }, { status: 400 });
    }
    
    return NextResponse.json({ 
      ok: true, 
      result: data,
      debugInfo: data?.[0]?.debug_info
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
