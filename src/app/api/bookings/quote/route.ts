import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const { tenantId, prevEndAt, newEndAt } = await req.json();

  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('quote_extension_cents', {
    p_tenant_id: tenantId,
    p_prev_end_at: prevEndAt,
    p_new_end_at: newEndAt,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ amountCents: data ?? 0 });
}
