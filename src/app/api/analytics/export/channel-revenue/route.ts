import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { createHash } from 'node:crypto';

function toCSV(rows: any[], headers: string[]) {
  const esc = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map(h => esc((r as any)[h])).join(','));
  return lines.join('\r\n');
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenant_id') ?? '';
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const basis = (url.searchParams.get('basis') ?? 'departure') as 'arrival'|'departure'|'stay_overlap';
  const granularity = (url.searchParams.get('granularity') ?? 'summary') as 'summary'|'daily';

  // NEW: optional statuses (comma-separated). null/empty = include ALL
  const statusesParam = url.searchParams.get('statuses'); // e.g. "confirmed,completed"
  const statuses = statusesParam ? statusesParam.split(',').map(s => s.trim()).filter(Boolean) : null;

  if (!tenantId || !from || !to) {
    return NextResponse.json({ error: 'tenant_id, from, to required' }, { status: 400 });
  }

  const supabase = getServerSupabase();

  // ---- Role gating: owner/finance/admin only
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { data: roleRow, error: roleErr } = await supabase
    .from('user_tenants')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 500 });
  const role = (roleRow?.role ?? '').toString().toLowerCase();
  const allowed = new Set(['owner','finance','admin']);
  if (!allowed.has(role)) {
    return NextResponse.json({ error: 'Forbidden: finance/owner/admin role required' }, { status: 403 });
  }

  // ---- Data
  let rows: any[] = [];
  if (granularity === 'daily') {
    const { data, error } = await supabase.rpc('channel_revenue_daily', {
      _tenant_id: tenantId,
      _from: from,
      _to: to,
      _basis: basis,
      _statuses: statuses
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows = (data ?? []).map((r: any) => ({
      date: r.date,
      channel: r.channel,
      bookings: r.bookings,
      money_received: r.money_received,
      money_charged: r.money_charged,
      avg_received_per_booking: r.avg_received_per_booking
    }));
  } else {
    const { data, error } = await supabase.rpc('channel_revenue_summary', {
      _tenant_id: tenantId,
      _from: from,
      _to: to,
      _basis: basis,
      _statuses: statuses
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows = (data ?? []).map((r: any) => ({
      channel: r.channel,
      bookings: r.bookings,
      money_received: r.money_received,
      money_charged: r.money_charged,
      avg_received_per_booking: r.avg_received_per_booking
    }));
  }

  const headersSummary = ['channel','bookings','money_received','money_charged','avg_received_per_booking'];
  const headersDaily   = ['date','channel','bookings','money_received','money_charged','avg_received_per_booking'];
  const headersOut = granularity === 'daily' ? headersDaily : headersSummary;
  const csv = toCSV(rows, headersOut);

  // ---- Save report (audit)
  const sha256 = createHash('sha256').update(csv).digest('hex');
  const suffix = statuses && statuses.length ? `_st-${statuses.join('+')}` : '';
  const filename = `channel-revenue_${tenantId}_${from}_${to}_${basis}_${granularity}${suffix}.csv`;
  const params = { tenant_id: tenantId, from, to, basis, granularity, statuses, columns: headersOut };

  await supabase.from('reports').insert({
    tenant_id: tenantId,
    user_id: userId,
    kind: 'channel_revenue',
    params,
    row_count: rows.length,
    sha256,
    filename
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
}
