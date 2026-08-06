/**
 * Shared reporting filter + types for the Analytics reporting engine.
 */
import { z } from 'zod';
import { exportDateRangeUtcBounds } from '@/lib/analytics/accountingExportFormat';
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/datetime/parse';

export const DATE_BASIS = ['booking', 'arrival', 'departure'] as const;
export type DateBasis = (typeof DATE_BASIS)[number];

export const GROUP_BY = [
  'day',
  'week',
  'month',
  'year',
  'channel',
  'status',
  'weekday_arrival',
  'weekday_departure',
  'stay_bucket',
  'lead_bucket',
] as const;
export type GroupBy = (typeof GROUP_BY)[number];

export const reportingFiltersSchema = z.object({
  tenantId: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateBasis: z.enum(DATE_BASIS).default('arrival'),
  channel: z.string().optional(),
  status: z.string().optional(),
  stayMin: z.coerce.number().optional(),
  stayMax: z.coerce.number().optional(),
  leadMin: z.coerce.number().optional(),
  leadMax: z.coerce.number().optional(),
  timezone: z.string().optional(),
});

export type ReportingFilters = z.infer<typeof reportingFiltersSchema>;

export type ReportingKpis = {
  bookings: number;
  grossRevenue: number;
  commission: number | null;
  netRevenue: number | null;
  financeConfirmedCount: number;
  avgStayDays: number | null;
  avgLeadDays: number | null;
  avgBookingValue: number | null;
  moneyReceived: number;
  cancelledBookings: number;
  occupancyAvg: number | null;
  occupancyPeak: number | null;
};

export type AggregateRow = {
  groupKey: string;
  bookings: number;
  grossRevenue: number;
  commissionAmount: number | null;
  netRevenue: number | null;
  moneyReceived: number;
  avgBookingValue: number | null;
  avgStay: number | null;
  avgLead: number | null;
  cancelledBookings: number;
  pctOfBookings?: number;
  cancellationRate?: number;
};

/** Non-PII columns safe for anonymous / AI analysis export. */
export const ANONYMISED_EXPORT_FIELDS = [
  'booking_id',
  'reference',
  'booking_created_at',
  'arrival_at',
  'departure_at',
  'stay_duration_days',
  'booking_lead_days',
  'arrival_weekday',
  'departure_weekday',
  'arrival_month',
  'arrival_year',
  'channel',
  'source',
  'external_source',
  'booking_status',
  'external_status',
  'ops_status',
  'gate_status',
  'anpr_status',
  'gross_revenue',
  'commission_amount',
  'net_revenue',
  'money_charged',
  'money_received',
  'finance_confirmed',
] as const;

export const PII_EXPORT_FIELDS = [
  'customer_name',
  'customer_email',
  'customer_phone',
  'vehicle_registration',
] as const;

export const ALL_EXPORT_FIELDS = [
  ...ANONYMISED_EXPORT_FIELDS,
  ...PII_EXPORT_FIELDS,
] as const;

export type ExportField = (typeof ALL_EXPORT_FIELDS)[number];

export const EXPORT_PRESETS = {
  standard: [
    'reference',
    'booking_created_at',
    'arrival_at',
    'departure_at',
    'channel',
    'booking_status',
    'stay_duration_days',
    'booking_lead_days',
    'gross_revenue',
    'money_received',
  ],
  finance: [
    'reference',
    'arrival_at',
    'channel',
    'booking_status',
    'gross_revenue',
    'commission_amount',
    'net_revenue',
    'money_charged',
    'money_received',
    'finance_confirmed',
  ],
  anonymised: [...ANONYMISED_EXPORT_FIELDS],
} as const;

export function filtersToRpcPayload(
  filters: ReportingFilters,
  timezone: string = DEFAULT_TENANT_TIMEZONE
): Record<string, string> {
  const { fromUtc, toUtcExclusive } = exportDateRangeUtcBounds(
    filters.from,
    filters.to,
    timezone
  );
  const payload: Record<string, string> = {
    from: fromUtc,
    to: toUtcExclusive,
    dateBasis: filters.dateBasis,
  };
  if (filters.channel) payload.channel = filters.channel;
  if (filters.status) payload.status = filters.status;
  if (filters.stayMin != null) payload.stayMin = String(filters.stayMin);
  if (filters.stayMax != null) payload.stayMax = String(filters.stayMax);
  if (filters.leadMin != null) payload.leadMin = String(filters.leadMin);
  if (filters.leadMax != null) payload.leadMax = String(filters.leadMax);
  return payload;
}

export function previousPeriodRange(from: string, to: string): { from: string; to: string } {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const prevEnd = new Date(start.getTime() - 86_400_000);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86_400_000);
  return {
    from: prevStart.toISOString().slice(0, 10),
    to: prevEnd.toISOString().slice(0, 10),
  };
}

export function parseFiltersFromSearchParams(
  searchParams: URLSearchParams,
  tenantId: string
): ReportingFilters {
  return reportingFiltersSchema.parse({
    tenantId,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
    dateBasis: searchParams.get('dateBasis') ?? 'arrival',
    channel: searchParams.get('channel') || undefined,
    status: searchParams.get('status') || undefined,
    stayMin: searchParams.get('stayMin') || undefined,
    stayMax: searchParams.get('stayMax') || undefined,
    leadMin: searchParams.get('leadMin') || undefined,
    leadMax: searchParams.get('leadMax') || undefined,
    timezone: searchParams.get('timezone') || undefined,
  });
}
