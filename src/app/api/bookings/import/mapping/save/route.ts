import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

export async function POST(req: Request) {
  try {
    const supabase = await getServerSupabase();
    const adminClient = await createAdminClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const body = await req.json();
    const { tenantId, name, mapping, headerSignature, userId } = body;

    if (!tenantId || !name || !mapping || !headerSignature) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { error } = await adminClient
      .from('booking_import_mappings')
      .upsert({
        tenant_id: tenantId,
        name,
        mapping,
        header_signature: headerSignature,
        created_by: userId || user.id,
      }, { onConflict: 'tenant_id,header_signature' });

    if (error) {
      console.error('❌ Failed to save mapping:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('❌ Save mapping error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}




