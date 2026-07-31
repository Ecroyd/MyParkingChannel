import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { canViewFinancials } from '@/lib/auth/permissions';
import { createAdminClient } from '@/lib/supabase/server-admin';
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/datetime/parse';
import {
  exportChannel,
  exportDateRangeUtcBounds,
  exportStayDays,
  formatExportDateTime,
  money2,
} from '@/lib/analytics/accountingExportFormat';

export const dynamic = 'force-dynamic';

const CSV_HEADERS = [
  'reference',
  'start_at',
  'end_at',
  'days',
  'customer_name',
  'plate',
  'money_charged',
  'money_received',
  'channel',
  'status',
  'created_at',
] as const;

function escapeCsvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  const quoted = s.replace(/"/g, '""');
  return `"${quoted}"`;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getCurrentTenantContext();
    if (!ctx || !canViewFinancials(ctx.role)) {
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

    const { data: tenantRow } = await adminClient
      .from('tenants')
      .select('timezone')
      .eq('id', tenantId)
      .maybeSingle();
    const timezone = tenantRow?.timezone || DEFAULT_TENANT_TIMEZONE;

    const { fromUtc, toUtcExclusive } = exportDateRangeUtcBounds(from, to, timezone);

    const { data: rows, error: queryError } = await adminClient
      .from('bookings')
      .select(
        'reference, start_at, end_at, customer_name, plate, money_charged, money_received, source, external_source, status, created_at',
      )
      .eq('tenant_id', tenantId)
      .gte('start_at', fromUtc)
      .lt('start_at', toUtcExclusive)
      .order('start_at', { ascending: true });

    if (queryError) {
      console.error('Accounting export query error', queryError);
      return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    const withChannel = (rows || []).map((r) => ({
      ...r,
      channel: exportChannel(r),
    }));

    if (listOnly) {
      const agents = [...new Set(withChannel.map((r) => r.channel))].sort();
      return NextResponse.json({ agents });
    }

    let filtered = withChannel;
    if (agent != null && agent !== '') {
      filtered = withChannel.filter((r) => r.channel === agent);
    }

    const csvRows = [
      CSV_HEADERS.join(','),
      ...filtered.map((r) => {
        const row: Record<(typeof CSV_HEADERS)[number], string | number> = {
          reference: r.reference ?? '',
          start_at: formatExportDateTime(r.start_at, timezone),
          end_at: formatExportDateTime(r.end_at, timezone),
          days: exportStayDays(r.start_at, r.end_at, timezone),
          customer_name: r.customer_name ?? '',
          plate: r.plate ?? '',
          money_charged: money2(r.money_charged),
          money_received: money2(r.money_received),
          channel: r.channel,
          status: r.status ?? '',
          created_at: formatExportDateTime(r.created_at, timezone),
        };
        return CSV_HEADERS.map((h) => escapeCsvCell(row[h])).join(',');
      }),
    ];

    // UTF-8 BOM so Excel opens special characters correctly
    const csv = `\uFEFF${csvRows.join('\n')}`;
    const agentSuffix =
      agent != null && agent !== '' ? `-${agent.replace(/[^a-zA-Z0-9-_]/g, '_')}` : '-all';
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
      { status: 500 },
    );
  }
}
