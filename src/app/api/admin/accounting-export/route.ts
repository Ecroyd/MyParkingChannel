import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { createAdminClient } from '@/lib/supabase/server-admin';

export const dynamic = 'force-dynamic';

const CSV_HEADERS = [
  'reference',
  'start_at',
  'end_at',
  'customer_name',
  'plate',
  'money_charged',
  'money_received',
  'source',
  'external_source',
  'agent_key',
  'status',
  'created_at',
];

function escapeCsvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  const quoted = s.replace(/"/g, '""');
  return `"${quoted}"`;
}

/** agent_key = COALESCE(external_source, source, 'other') for display/filter */
function agentKey(row: { external_source?: string | null; source?: string | null }): string {
  const ext = row.external_source?.trim();
  const src = row.source?.trim();
  if (ext) return ext;
  if (src) return src;
  return 'other';
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getCurrentTenantContext();
    if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'owner')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const tenantId = ctx.tenantId;
    const adminClient = createAdminClient();

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const agent = searchParams.get('agent');
    const listOnly = searchParams.get('list') === '1';

    if (!from || !to) {
      return NextResponse.json({ error: 'from and to (YYYY-MM-DD) required' }, { status: 400 });
    }

    const fromDate = `${from}T00:00:00.000Z`;
    const toDate = `${to}T23:59:59.999Z`;

    let query = adminClient
      .from('bookings')
      .select('reference, start_at, end_at, customer_name, plate, money_charged, money_received, source, external_source, status, created_at')
      .eq('tenant_id', tenantId)
      .gte('start_at', fromDate)
      .lte('start_at', toDate)
      .order('start_at', { ascending: true });

    const { data: rows, error: queryError } = await query;

    if (queryError) {
      console.error('Accounting export query error', queryError);
      return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    const withAgent = (rows || []).map((r) => ({ ...r, agent_key: agentKey(r) }));

    if (listOnly) {
      const agents = [...new Set(withAgent.map((r) => r.agent_key))].sort();
      return NextResponse.json({ agents });
    }

    let filtered = withAgent;
    if (agent != null && agent !== '') {
      filtered = withAgent.filter((r) => r.agent_key === agent);
    }

    const csvRows = [
      CSV_HEADERS.join(','),
      ...filtered.map((r) =>
        CSV_HEADERS.map((h) => escapeCsvCell((r as Record<string, unknown>)[h])).join(',')
      ),
    ];
    const csv = csvRows.join('\n');
    const agentSuffix = agent != null && agent !== '' ? `-${agent.replace(/[^a-zA-Z0-9-_]/g, '_')}` : '-all';
    const filename = `accounting-export-${from}-${to}${agentSuffix}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err: unknown) {
    console.error('Accounting export error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
