/**
 * Server-side reporting engine: KPIs, aggregates, rows, finance snapshots.
 */
import { createAdminClient } from '@/lib/supabase/server-admin';
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/datetime/parse';
import { exportChannel } from '@/lib/analytics/accountingExportFormat';
import {
  filtersToRpcPayload,
  previousPeriodRange,
  type AggregateRow,
  type GroupBy,
  type ReportingFilters,
  type ReportingKpis,
} from '@/lib/analytics/reportingTypes';

const NON_PII_SELECT =
  'booking_id, tenant_id, reference, booking_created_at, arrival_at, departure_at, stay_duration_days, booking_lead_days, arrival_weekday, departure_weekday, arrival_month, arrival_year, departure_month, channel, source, external_source, booking_status, external_status, ops_status, gate_status, anpr_status, money_charged, money_received, gross_revenue, commission_amount, net_revenue, finance_confirmed, tenant_timezone';

function mapAggRow(row: Record<string, unknown>): AggregateRow {
  return {
    groupKey: String(row.group_key ?? row.groupKey ?? ''),
    bookings: Number(row.bookings ?? 0),
    grossRevenue: Number(row.gross_revenue ?? row.grossRevenue ?? 0),
    commissionAmount:
      row.commission_amount == null && row.commissionAmount == null
        ? null
        : Number(row.commission_amount ?? row.commissionAmount),
    netRevenue:
      row.net_revenue == null && row.netRevenue == null
        ? null
        : Number(row.net_revenue ?? row.netRevenue),
    moneyReceived: Number(row.money_received ?? row.moneyReceived ?? 0),
    avgBookingValue:
      row.avg_booking_value == null && row.avgBookingValue == null
        ? null
        : Number(row.avg_booking_value ?? row.avgBookingValue),
    avgStay:
      row.avg_stay == null && row.avgStay == null
        ? null
        : Number(row.avg_stay ?? row.avgStay),
    avgLead:
      row.avg_lead == null && row.avgLead == null
        ? null
        : Number(row.avg_lead ?? row.avgLead),
    cancelledBookings: Number(row.cancelled_bookings ?? row.cancelledBookings ?? 0),
  };
}

export async function getReportingKpis(
  filters: ReportingFilters,
  opts?: { comparePrevious?: boolean; occupancy?: { avg: number | null; peak: number | null } }
): Promise<{ current: ReportingKpis; previous: ReportingKpis | null }> {
  const admin = createAdminClient();
  const timezone = filters.timezone || DEFAULT_TENANT_TIMEZONE;
  const payload = filtersToRpcPayload(filters, timezone);

  let current = await fetchKpisRpc(admin, filters.tenantId, payload);
  if (!current) {
    current = await fetchKpisFallback(admin, filters, timezone);
  }

  current.occupancyAvg = opts?.occupancy?.avg ?? null;
  current.occupancyPeak = opts?.occupancy?.peak ?? null;

  let previous: ReportingKpis | null = null;
  if (opts?.comparePrevious) {
    const prevRange = previousPeriodRange(filters.from, filters.to);
    const prevFilters = { ...filters, ...prevRange };
    const prevPayload = filtersToRpcPayload(prevFilters, timezone);
    previous =
      (await fetchKpisRpc(admin, filters.tenantId, prevPayload)) ??
      (await fetchKpisFallback(admin, prevFilters, timezone));
    previous.occupancyAvg = null;
    previous.occupancyPeak = null;
  }

  return { current, previous };
}

async function fetchKpisRpc(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  payload: Record<string, string>
): Promise<ReportingKpis | null> {
  try {
    const { data, error } = await admin.rpc('reporting_kpis', {
      p_tenant_id: tenantId,
      p_filters: payload,
    });
    if (error || !data) return null;
    const row = data as Record<string, unknown>;
    return {
      bookings: Number(row.bookings ?? 0),
      grossRevenue: Number(row.grossRevenue ?? 0),
      commission: row.commission == null ? null : Number(row.commission),
      netRevenue: row.netRevenue == null ? null : Number(row.netRevenue),
      financeConfirmedCount: Number(row.financeConfirmedCount ?? 0),
      avgStayDays: row.avgStayDays == null ? null : Number(row.avgStayDays),
      avgLeadDays: row.avgLeadDays == null ? null : Number(row.avgLeadDays),
      avgBookingValue: row.avgBookingValue == null ? null : Number(row.avgBookingValue),
      moneyReceived: Number(row.moneyReceived ?? 0),
      cancelledBookings: Number(row.cancelledBookings ?? 0),
      occupancyAvg: null,
      occupancyPeak: null,
    };
  } catch {
    return null;
  }
}

async function fetchKpisFallback(
  admin: ReturnType<typeof createAdminClient>,
  filters: ReportingFilters,
  timezone: string
): Promise<ReportingKpis> {
  const rows = await loadFilteredReportingRows(admin, filters, timezone, {
    limit: 50_000,
    includePii: false,
  });
  const bookings = rows.length;
  const grossRevenue = rows.reduce((s, r) => s + Number(r.gross_revenue ?? 0), 0);
  const confirmed = rows.filter((r) => r.finance_confirmed);
  const commission =
    confirmed.length === 0
      ? null
      : confirmed.reduce((s, r) => s + Number(r.commission_amount ?? 0), 0);
  const netRevenue =
    confirmed.length === 0
      ? null
      : confirmed.reduce((s, r) => s + Number(r.net_revenue ?? 0), 0);
  const moneyReceived = rows.reduce((s, r) => s + Number(r.money_received ?? 0), 0);
  const stayVals = rows
    .map((r) => Number(r.stay_duration_days))
    .filter((n) => Number.isFinite(n));
  const leadVals = rows
    .map((r) => Number(r.booking_lead_days))
    .filter((n) => Number.isFinite(n));
  const cancelledBookings = rows.filter((r) =>
    ['cancelled', 'canceled'].includes(String(r.booking_status ?? '').toLowerCase())
  ).length;

  return {
    bookings,
    grossRevenue: round2(grossRevenue),
    commission: commission == null ? null : round2(commission),
    netRevenue: netRevenue == null ? null : round2(netRevenue),
    financeConfirmedCount: confirmed.length,
    avgStayDays: stayVals.length ? round2(avg(stayVals)) : null,
    avgLeadDays: leadVals.length ? round2(avg(leadVals)) : null,
    avgBookingValue: bookings ? round2(grossRevenue / bookings) : null,
    moneyReceived: round2(moneyReceived),
    cancelledBookings,
    occupancyAvg: null,
    occupancyPeak: null,
  };
}

export async function getReportingAggregate(
  filters: ReportingFilters,
  groupBy: GroupBy
): Promise<AggregateRow[]> {
  const admin = createAdminClient();
  const timezone = filters.timezone || DEFAULT_TENANT_TIMEZONE;
  const payload = filtersToRpcPayload(filters, timezone);

  try {
    const { data, error } = await admin.rpc('reporting_aggregate', {
      p_tenant_id: filters.tenantId,
      p_filters: payload,
      p_group_by: groupBy,
      p_metrics: ['bookings', 'gross_revenue'],
    });
    if (!error && Array.isArray(data)) {
      const rows = data.map((r) => mapAggRow(r as Record<string, unknown>));
      return annotateChannelRows(rows);
    }
  } catch {
    // fall through
  }

  return aggregateInMemory(
    await loadFilteredReportingRows(admin, filters, timezone, {
      limit: 50_000,
      includePii: false,
    }),
    groupBy,
    filters.dateBasis
  );
}

function annotateChannelRows(rows: AggregateRow[]): AggregateRow[] {
  const total = rows.reduce((s, r) => s + r.bookings, 0) || 1;
  return rows.map((r) => ({
    ...r,
    pctOfBookings: round2((r.bookings / total) * 100),
    cancellationRate:
      r.bookings > 0 ? round2((r.cancelledBookings / r.bookings) * 100) : 0,
  }));
}

export async function getChannelPerformance(
  filters: ReportingFilters
): Promise<AggregateRow[]> {
  return getReportingAggregate(filters, 'channel');
}

type ReportingRow = Record<string, unknown>;

export async function loadFilteredReportingRows(
  admin: ReturnType<typeof createAdminClient>,
  filters: ReportingFilters,
  timezone: string,
  opts: { limit: number; offset?: number; includePii: boolean; fields?: string[] }
): Promise<ReportingRow[]> {
  const payload = filtersToRpcPayload(filters, timezone);
  const basisCol =
    filters.dateBasis === 'booking'
      ? 'booking_created_at'
      : filters.dateBasis === 'departure'
        ? 'departure_at'
        : 'arrival_at';

  const selectCols = opts.fields?.length
    ? opts.fields.join(', ')
    : opts.includePii
      ? `${NON_PII_SELECT}, customer_name, customer_email, customer_phone, vehicle_registration`
      : NON_PII_SELECT;

  let query = admin
    .from('v_booking_reporting')
    .select(selectCols)
    .eq('tenant_id', filters.tenantId)
    .gte(basisCol, payload.from)
    .lt(basisCol, payload.to)
    .order(basisCol, { ascending: true })
    .range(opts.offset ?? 0, (opts.offset ?? 0) + opts.limit - 1);

  if (filters.channel) {
    query = query.ilike('channel', filters.channel);
  }
  if (filters.status) {
    query = query.ilike('booking_status', filters.status);
  }
  if (filters.stayMin != null) {
    query = query.gte('stay_duration_days', filters.stayMin);
  }
  if (filters.stayMax != null) {
    query = query.lte('stay_duration_days', filters.stayMax);
  }
  if (filters.leadMin != null) {
    query = query.gte('booking_lead_days', filters.leadMin);
  }
  if (filters.leadMax != null) {
    query = query.lte('booking_lead_days', filters.leadMax);
  }

  const { data, error } = await query;
  if (error) {
    // View may not exist yet — fall back to bookings table
    return loadFromBookingsFallback(admin, filters, timezone, opts);
  }
  return (data ?? []) as unknown as ReportingRow[];
}

async function loadFromBookingsFallback(
  admin: ReturnType<typeof createAdminClient>,
  filters: ReportingFilters,
  timezone: string,
  opts: { limit: number; offset?: number; includePii: boolean }
): Promise<ReportingRow[]> {
  const payload = filtersToRpcPayload(filters, timezone);
  const basisCol =
    filters.dateBasis === 'booking'
      ? 'created_at'
      : filters.dateBasis === 'departure'
        ? 'end_at'
        : 'start_at';

  const cols = opts.includePii
    ? 'id, tenant_id, reference, created_at, start_at, end_at, source, external_source, status, external_status, ops_status, gate_status, anpr_status, money_charged, money_received, customer_name, customer_email, customer_phone, plate'
    : 'id, tenant_id, reference, created_at, start_at, end_at, source, external_source, status, external_status, ops_status, gate_status, anpr_status, money_charged, money_received';

  let query = admin
    .from('bookings')
    .select(cols)
    .eq('tenant_id', filters.tenantId)
    .gte(basisCol, payload.from)
    .lt(basisCol, payload.to)
    .order(basisCol, { ascending: true })
    .range(opts.offset ?? 0, (opts.offset ?? 0) + opts.limit - 1);

  if (filters.status) query = query.ilike('status', filters.status);

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((b) => {
    const start = b.start_at ? new Date(String(b.start_at)).getTime() : NaN;
    const end = b.end_at ? new Date(String(b.end_at)).getTime() : NaN;
    const created = b.created_at ? new Date(String(b.created_at)).getTime() : NaN;
    const stay =
      Number.isFinite(start) && Number.isFinite(end)
        ? Math.max(1, Math.ceil((end - start) / 86_400_000))
        : 1;
    const lead =
      Number.isFinite(start) && Number.isFinite(created)
        ? Math.max(0, Math.floor((start - created) / 86_400_000))
        : null;
    return {
      booking_id: b.id,
      tenant_id: b.tenant_id,
      reference: b.reference,
      booking_created_at: b.created_at,
      arrival_at: b.start_at,
      departure_at: b.end_at,
      stay_duration_days: stay,
      booking_lead_days: lead,
      channel: exportChannel({
        external_source: b.external_source as string | null,
        source: b.source as string | null,
      }),
      source: b.source,
      external_source: b.external_source,
      booking_status: b.status,
      external_status: b.external_status,
      ops_status: b.ops_status,
      gate_status: b.gate_status,
      anpr_status: b.anpr_status,
      money_charged: b.money_charged,
      money_received: b.money_received,
      gross_revenue: Number(b.money_charged ?? b.money_received ?? 0),
      commission_amount: null,
      net_revenue: null,
      finance_confirmed: false,
      customer_name: b.customer_name,
      customer_email: b.customer_email,
      customer_phone: b.customer_phone,
      vehicle_registration: b.plate,
      tenant_timezone: timezone,
    };
  });
}

function aggregateInMemory(
  rows: ReportingRow[],
  groupBy: GroupBy,
  dateBasis: ReportingFilters['dateBasis']
): AggregateRow[] {
  const map = new Map<string, AggregateRow & { staySum: number; leadSum: number; leadCount: number }>();

  for (const r of rows) {
    const basisAt =
      dateBasis === 'booking'
        ? r.booking_created_at
        : dateBasis === 'departure'
          ? r.departure_at
          : r.arrival_at;
    const key = groupKeyFor(r, groupBy, String(basisAt ?? ''), String(r.tenant_timezone ?? 'Europe/London'));
    const cur = map.get(key) ?? {
      groupKey: key,
      bookings: 0,
      grossRevenue: 0,
      commissionAmount: null as number | null,
      netRevenue: null as number | null,
      moneyReceived: 0,
      avgBookingValue: null,
      avgStay: null,
      avgLead: null,
      cancelledBookings: 0,
      staySum: 0,
      leadSum: 0,
      leadCount: 0,
    };
    cur.bookings += 1;
    cur.grossRevenue += Number(r.gross_revenue ?? 0);
    cur.moneyReceived += Number(r.money_received ?? 0);
    cur.staySum += Number(r.stay_duration_days ?? 0);
    if (r.booking_lead_days != null) {
      cur.leadSum += Number(r.booking_lead_days);
      cur.leadCount += 1;
    }
    if (r.finance_confirmed) {
      cur.commissionAmount = (cur.commissionAmount ?? 0) + Number(r.commission_amount ?? 0);
      cur.netRevenue = (cur.netRevenue ?? 0) + Number(r.net_revenue ?? 0);
    }
    if (['cancelled', 'canceled'].includes(String(r.booking_status ?? '').toLowerCase())) {
      cur.cancelledBookings += 1;
    }
    map.set(key, cur);
  }

  const out = Array.from(map.values()).map((r) => ({
    groupKey: r.groupKey,
    bookings: r.bookings,
    grossRevenue: round2(r.grossRevenue),
    commissionAmount: r.commissionAmount == null ? null : round2(r.commissionAmount),
    netRevenue: r.netRevenue == null ? null : round2(r.netRevenue),
    moneyReceived: round2(r.moneyReceived),
    avgBookingValue: r.bookings ? round2(r.grossRevenue / r.bookings) : null,
    avgStay: r.bookings ? round2(r.staySum / r.bookings) : null,
    avgLead: r.leadCount ? round2(r.leadSum / r.leadCount) : null,
    cancelledBookings: r.cancelledBookings,
  }));
  return annotateChannelRows(out).sort((a, b) => a.groupKey.localeCompare(b.groupKey));
}

function groupKeyFor(
  r: ReportingRow,
  groupBy: GroupBy,
  basisAt: string,
  tz: string
): string {
  const d = basisAt ? new Date(basisAt) : null;
  switch (groupBy) {
    case 'channel':
      return String(r.channel ?? 'other');
    case 'status':
      return String(r.booking_status ?? 'unknown');
    case 'weekday_arrival':
      return String(r.arrival_weekday ?? '');
    case 'weekday_departure':
      return String(r.departure_weekday ?? '');
    case 'month':
      return d
        ? new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' })
            .format(d)
            .replace('/', '-')
        : 'unknown';
    case 'year':
      return d
        ? new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric' }).format(d)
        : 'unknown';
    case 'week': {
      if (!d) return 'unknown';
      const day = formatYmd(d, tz);
      return day.slice(0, 7) + '-W';
    }
    case 'stay_bucket': {
      const s = Number(r.stay_duration_days ?? 0);
      if (s <= 1) return '1';
      if (s <= 3) return '2-3';
      if (s <= 7) return '4-7';
      if (s <= 14) return '8-14';
      return '15+';
    }
    case 'lead_bucket': {
      const l = r.booking_lead_days == null ? null : Number(r.booking_lead_days);
      if (l == null) return 'unknown';
      if (l <= 1) return '0-1';
      if (l <= 7) return '2-7';
      if (l <= 30) return '8-30';
      if (l <= 90) return '31-90';
      return '90+';
    }
    default:
      return d ? formatYmd(d, tz) : 'unknown';
  }
}

function formatYmd(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Snapshot finance for a booking when an active commission rule matches.
 * Never invents commission without a rule. Does not overwrite confirmed rows
 * unless force=true.
 */
export async function snapshotBookingFinancials(opts: {
  tenantId: string;
  bookingId: string;
  channel?: string | null;
  grossAmount: number;
  bookingAt?: string;
  force?: boolean;
}): Promise<{ snapshotted: boolean; reason?: string }> {
  const admin = createAdminClient();
  const channel = (opts.channel ?? 'other').trim() || 'other';
  const at = opts.bookingAt ?? new Date().toISOString();

  if (!opts.force) {
    const { data: existing } = await admin
      .from('booking_financials')
      .select('id, confirmed')
      .eq('booking_id', opts.bookingId)
      .maybeSingle();
    if (existing?.confirmed) {
      return { snapshotted: false, reason: 'already_confirmed' };
    }
  }

  const { data: rules } = await admin
    .from('tenant_channel_commission_rules')
    .select('id, commission_type, rate, amount, currency, channel_code')
    .eq('tenant_id', opts.tenantId)
    .eq('is_active', true)
    .ilike('channel_code', channel)
    .lte('effective_from', at)
    .or(`effective_to.is.null,effective_to.gte.${at}`)
    .order('effective_from', { ascending: false })
    .limit(1);

  const rule = rules?.[0];
  if (!rule) {
    return { snapshotted: false, reason: 'no_rule' };
  }

  const gross = Number(opts.grossAmount) || 0;
  let commissionAmount = 0;
  if (rule.commission_type === 'percent') {
    commissionAmount = round2(gross * (Number(rule.rate ?? 0) / 100));
  } else {
    commissionAmount = round2(Number(rule.amount ?? 0));
  }
  const net = round2(gross - commissionAmount);

  const { error } = await admin.from('booking_financials').upsert(
    {
      tenant_id: opts.tenantId,
      booking_id: opts.bookingId,
      gross_amount: gross,
      commission_amount: commissionAmount,
      commission_rate: rule.commission_type === 'percent' ? rule.rate : null,
      commission_type: rule.commission_type,
      net_revenue: net,
      currency: rule.currency ?? 'GBP',
      channel,
      calculation_source: 'rule_snapshot',
      confirmed: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'booking_id' }
  );

  if (error) {
    console.warn('[reporting] financial snapshot failed', error.message);
    return { snapshotted: false, reason: error.message };
  }
  return { snapshotted: true };
}
