'use client';

import React, { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format, subDays } from 'date-fns';
import {
  Download,
  Filter,
  Loader2,
  Save,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import DemandCurve from '@/components/charts/DemandCurve';
import {
  ALL_EXPORT_FIELDS,
  ANONYMISED_EXPORT_FIELDS,
  GROUP_BY,
  PII_EXPORT_FIELDS,
  type AggregateRow,
  type DateBasis,
  type GroupBy,
  type ReportingKpis,
} from '@/lib/analytics/reportingTypes';

const CHART_COLORS = ['#0f766e', '#0369a1', '#b45309', '#7c3aed', '#be123c', '#15803d'];

type ChannelOption = { code: string; name: string };

type FiltersState = {
  from: string;
  to: string;
  dateBasis: DateBasis;
  channel: string;
  status: string;
  stayMin: string;
  stayMax: string;
  leadMin: string;
  leadMax: string;
};

type SavedReport = {
  id: string;
  name: string;
  description: string | null;
  report_definition: Record<string, unknown>;
};

function ymd(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

function money(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(n);
}

function num(n: number | null | undefined, digits = 1): string {
  if (n == null) return '—';
  return n.toFixed(digits);
}

function filtersFromParams(sp: URLSearchParams): FiltersState {
  return {
    from: sp.get('from') || ymd(subDays(new Date(), 29)),
    to: sp.get('to') || ymd(new Date()),
    dateBasis: (sp.get('dateBasis') as DateBasis) || 'arrival',
    channel: sp.get('channel') || '',
    status: sp.get('status') || '',
    stayMin: sp.get('stayMin') || '',
    stayMax: sp.get('stayMax') || '',
    leadMin: sp.get('leadMin') || '',
    leadMax: sp.get('leadMax') || '',
  };
}

function buildQuery(tenantId: string, f: FiltersState, extra?: Record<string, string>) {
  const q = new URLSearchParams();
  q.set('tenant_id', tenantId);
  q.set('from', f.from);
  q.set('to', f.to);
  q.set('dateBasis', f.dateBasis);
  if (f.channel) q.set('channel', f.channel);
  if (f.status) q.set('status', f.status);
  if (f.stayMin) q.set('stayMin', f.stayMin);
  if (f.stayMax) q.set('stayMax', f.stayMax);
  if (f.leadMin) q.set('leadMin', f.leadMin);
  if (f.leadMax) q.set('leadMax', f.leadMax);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
  }
  return q;
}

function KpiTile({
  title,
  value,
  hint,
  muted,
}: {
  title: string;
  value: string;
  hint?: string;
  muted?: boolean;
}) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-xs font-medium text-slate-500">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className={`text-2xl font-semibold tabular-nums ${muted ? 'text-slate-400' : 'text-slate-900'}`}>
          {value}
        </div>
        {hint ? <p className="mt-1 text-[11px] text-slate-400">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export default function AnalyticsDashboard({
  tenantId,
  timezone = 'Europe/London',
}: {
  tenantId: string;
  timezone?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [filters, setFilters] = useState<FiltersState>(() =>
    filtersFromParams(new URLSearchParams(searchParams.toString()))
  );
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [kpis, setKpis] = useState<ReportingKpis | null>(null);
  const [prevKpis, setPrevKpis] = useState<ReportingKpis | null>(null);
  const [daySeries, setDaySeries] = useState<AggregateRow[]>([]);
  const [staySeries, setStaySeries] = useState<AggregateRow[]>([]);
  const [leadSeries, setLeadSeries] = useState<AggregateRow[]>([]);
  const [weekdayArrival, setWeekdayArrival] = useState<AggregateRow[]>([]);
  const [weekdayDeparture, setWeekdayDeparture] = useState<AggregateRow[]>([]);
  const [monthSeries, setMonthSeries] = useState<AggregateRow[]>([]);
  const [statusSeries, setStatusSeries] = useState<AggregateRow[]>([]);
  const [channelRows, setChannelRows] = useState<AggregateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportPreset, setExportPreset] = useState<'standard' | 'finance' | 'anonymised' | 'custom'>(
    'standard'
  );
  const [customFields, setCustomFields] = useState<string[]>([...ANONYMISED_EXPORT_FIELDS]);
  const [exporting, setExporting] = useState(false);

  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderGroupBy, setBuilderGroupBy] = useState<GroupBy>('channel');
  const [builderRows, setBuilderRows] = useState<AggregateRow[]>([]);
  const [builderLoading, setBuilderLoading] = useState(false);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [saveName, setSaveName] = useState('');

  const syncUrl = useCallback(
    (next: FiltersState) => {
      const q = new URLSearchParams();
      q.set('from', next.from);
      q.set('to', next.to);
      q.set('dateBasis', next.dateBasis);
      if (next.channel) q.set('channel', next.channel);
      if (next.status) q.set('status', next.status);
      if (next.stayMin) q.set('stayMin', next.stayMin);
      if (next.stayMax) q.set('stayMax', next.stayMax);
      if (next.leadMin) q.set('leadMin', next.leadMin);
      if (next.leadMax) q.set('leadMax', next.leadMax);
      startTransition(() => {
        router.replace(`${pathname}?${q.toString()}`, { scroll: false });
      });
    },
    [pathname, router]
  );

  const updateFilter = <K extends keyof FiltersState>(key: K, value: FiltersState[K]) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      syncUrl(next);
      return next;
    });
  };

  const setChannelFilter = (channel: string) => {
    setFilters((prev) => {
      const next = { ...prev, channel: prev.channel === channel ? '' : channel };
      syncUrl(next);
      return next;
    });
  };

  useEffect(() => {
    fetch(`/api/analytics/reporting/channels?tenant_id=${tenantId}&list=1`)
      .then((r) => r.json())
      .then((d) => setChannels(d.channels ?? []))
      .catch(() => setChannels([]));
  }, [tenantId]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const base = buildQuery(tenantId, filters);
        const [kpiRes, dayRes, stayRes, leadRes, waRes, wdRes, monthRes, statusRes, chRes] =
          await Promise.all([
            fetch(`/api/analytics/reporting/kpis?${base}&compare=1`),
            fetch(`/api/analytics/reporting/series?${base}&groupBy=day`),
            fetch(`/api/analytics/reporting/series?${base}&groupBy=stay_bucket`),
            fetch(`/api/analytics/reporting/series?${base}&groupBy=lead_bucket`),
            fetch(`/api/analytics/reporting/series?${base}&groupBy=weekday_arrival`),
            fetch(`/api/analytics/reporting/series?${base}&groupBy=weekday_departure`),
            fetch(`/api/analytics/reporting/series?${base}&groupBy=month`),
            fetch(`/api/analytics/reporting/series?${base}&groupBy=status`),
            fetch(`/api/analytics/reporting/channels?${base}`),
          ]);

        if (cancelled) return;

        const kpiJson = await kpiRes.json();
        if (!kpiRes.ok) throw new Error(kpiJson.error || 'KPI load failed');

        setKpis(kpiJson.current);
        setPrevKpis(kpiJson.previous);
        setDaySeries((await dayRes.json()).rows ?? []);
        setStaySeries((await stayRes.json()).rows ?? []);
        setLeadSeries((await leadRes.json()).rows ?? []);
        setWeekdayArrival((await waRes.json()).rows ?? []);
        setWeekdayDeparture((await wdRes.json()).rows ?? []);
        setMonthSeries((await monthRes.json()).rows ?? []);
        setStatusSeries((await statusRes.json()).rows ?? []);
        setChannelRows((await chRes.json()).rows ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load analytics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [tenantId, filters]);

  const loadSavedReports = useCallback(async () => {
    const res = await fetch(`/api/analytics/reporting/saved-reports?tenant_id=${tenantId}`);
    const data = await res.json();
    setSavedReports(data.reports ?? []);
  }, [tenantId]);

  useEffect(() => {
    if (builderOpen) void loadSavedReports();
  }, [builderOpen, loadSavedReports]);

  const runBuilder = async () => {
    setBuilderLoading(true);
    try {
      const q = buildQuery(tenantId, filters, { groupBy: builderGroupBy });
      const res = await fetch(`/api/analytics/reporting/series?${q}`);
      const data = await res.json();
      setBuilderRows(data.rows ?? []);
    } finally {
      setBuilderLoading(false);
    }
  };

  const saveReport = async () => {
    if (!saveName.trim()) return;
    await fetch('/api/analytics/reporting/saved-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: tenantId,
        name: saveName.trim(),
        report_definition: {
          filters,
          groupBy: builderGroupBy,
        },
      }),
    });
    setSaveName('');
    await loadSavedReports();
  };

  const deleteReport = async (id: string) => {
    await fetch(
      `/api/analytics/reporting/saved-reports?tenant_id=${tenantId}&id=${id}`,
      { method: 'DELETE' }
    );
    await loadSavedReports();
  };

  const applySaved = (report: SavedReport) => {
    const def = report.report_definition || {};
    const f = def.filters as FiltersState | undefined;
    if (f?.from && f?.to) {
      setFilters(f);
      syncUrl(f);
    }
    if (typeof def.groupBy === 'string' && GROUP_BY.includes(def.groupBy as GroupBy)) {
      setBuilderGroupBy(def.groupBy as GroupBy);
    }
  };

  const doExport = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/analytics/reporting/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          ...filters,
          stayMin: filters.stayMin || undefined,
          stayMax: filters.stayMax || undefined,
          leadMin: filters.leadMin || undefined,
          leadMax: filters.leadMax || undefined,
          preset: exportPreset,
          fields: exportPreset === 'custom' ? customFields : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ||
        'reporting.csv';
      a.click();
      URL.revokeObjectURL(url);
      setExportOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const financeHint =
    kpis && kpis.financeConfirmedCount === 0
      ? 'Unconfirmed — no commission snapshots in range'
      : kpis
        ? `${kpis.financeConfirmedCount} confirmed booking(s)`
        : undefined;

  const dayChart = useMemo(
    () =>
      daySeries.map((r) => ({
        date: r.groupKey,
        bookings: r.bookings,
        revenue: r.grossRevenue,
      })),
    [daySeries]
  );

  const toggleCustomField = (field: string, checked: boolean) => {
    setCustomFields((prev) =>
      checked ? [...new Set([...prev, field])] : prev.filter((f) => f !== field)
    );
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="grid gap-3 p-4 md:grid-cols-4 lg:grid-cols-8">
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">From</Label>
            <Input
              type="date"
              value={filters.from}
              onChange={(e) => updateFilter('from', e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">To</Label>
            <Input
              type="date"
              value={filters.to}
              onChange={(e) => updateFilter('to', e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Date basis</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={filters.dateBasis}
              onChange={(e) => updateFilter('dateBasis', e.target.value as DateBasis)}
            >
              <option value="arrival">Arrival</option>
              <option value="departure">Departure</option>
              <option value="booking">Booking created</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Channel</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={filters.channel}
              onChange={(e) => updateFilter('channel', e.target.value)}
            >
              <option value="">All channels</option>
              {channels.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name || c.code}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Status</Label>
            <Input
              placeholder="e.g. confirmed"
              value={filters.status}
              onChange={(e) => updateFilter('status', e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Stay days</Label>
            <div className="flex gap-1">
              <Input
                placeholder="min"
                value={filters.stayMin}
                onChange={(e) => updateFilter('stayMin', e.target.value)}
                className="h-9"
              />
              <Input
                placeholder="max"
                value={filters.stayMax}
                onChange={(e) => updateFilter('stayMax', e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Lead days</Label>
            <div className="flex gap-1">
              <Input
                placeholder="min"
                value={filters.leadMin}
                onChange={(e) => updateFilter('leadMin', e.target.value)}
                className="h-9"
              />
              <Input
                placeholder="max"
                value={filters.leadMax}
                onChange={(e) => updateFilter('leadMax', e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => setBuilderOpen(true)}
            >
              <Filter className="mr-1 h-3.5 w-3.5" />
              Builder
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => setExportOpen(true)}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              Export
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {(loading || pending) && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Updating…
        </div>
      )}

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <KpiTile title="Bookings" value={kpis ? String(kpis.bookings) : '—'} />
        <KpiTile title="Gross revenue" value={money(kpis?.grossRevenue)} />
        <KpiTile
          title="Commission"
          value={money(kpis?.commission)}
          muted={kpis?.commission == null}
          hint={financeHint}
        />
        <KpiTile
          title="Net revenue"
          value={money(kpis?.netRevenue)}
          muted={kpis?.netRevenue == null}
          hint={financeHint}
        />
        <KpiTile title="Avg stay (days)" value={num(kpis?.avgStayDays)} />
        <KpiTile title="Avg lead (days)" value={num(kpis?.avgLeadDays)} />
        <KpiTile title="Avg booking value" value={money(kpis?.avgBookingValue)} />
        <KpiTile
          title="Occupancy avg"
          value={kpis?.occupancyAvg != null ? `${kpis.occupancyAvg}%` : '—'}
          hint={
            kpis?.occupancyPeak != null ? `Peak ${kpis.occupancyPeak}%` : `TZ ${timezone}`
          }
        />
      </div>

      {prevKpis ? (
        <p className="text-xs text-slate-400">
          Previous period: {prevKpis.bookings} bookings · {money(prevKpis.grossRevenue)} gross
        </p>
      ) : null}

      {/* Trends */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-700">
              Bookings &amp; revenue over time
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dayChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="bookings"
                  stroke="#0f766e"
                  strokeWidth={2}
                  dot={false}
                  name="Bookings"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="revenue"
                  stroke="#0369a1"
                  strokeWidth={2}
                  dot={false}
                  name="Gross £"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-700">Status breakdown</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusSeries}
                  dataKey="bookings"
                  nameKey="groupKey"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={(props) => {
                    const name = String(props.name ?? '');
                    const pct = typeof props.percent === 'number' ? props.percent : 0;
                    return `${name} ${(pct * 100).toFixed(0)}%`;
                  }}
                >
                  {statusSeries.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Channel table */}
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-700">
            Channel performance
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="py-2 pr-3">Channel</th>
                <th className="py-2 pr-3">Bookings</th>
                <th className="py-2 pr-3">% of bookings</th>
                <th className="py-2 pr-3">Gross</th>
                <th className="py-2 pr-3">Commission</th>
                <th className="py-2 pr-3">Net</th>
                <th className="py-2 pr-3">Avg value</th>
                <th className="py-2">Cancel %</th>
              </tr>
            </thead>
            <tbody>
              {channelRows.map((r) => (
                <tr
                  key={r.groupKey}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                  onClick={() => setChannelFilter(r.groupKey)}
                >
                  <td className="py-2 pr-3 font-medium text-teal-800">{r.groupKey}</td>
                  <td className="py-2 pr-3 tabular-nums">{r.bookings}</td>
                  <td className="py-2 pr-3 tabular-nums">{num(r.pctOfBookings, 1)}%</td>
                  <td className="py-2 pr-3 tabular-nums">{money(r.grossRevenue)}</td>
                  <td className="py-2 pr-3 tabular-nums text-slate-500">
                    {money(r.commissionAmount)}
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-slate-500">
                    {money(r.netRevenue)}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{money(r.avgBookingValue)}</td>
                  <td className="py-2 tabular-nums">{num(r.cancellationRate, 1)}%</td>
                </tr>
              ))}
              {!channelRows.length && !loading ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-400">
                    No channel data for this range
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channelRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="groupKey" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="bookings" fill="#0f766e" name="Bookings" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Stay / lead / weekday / seasonality */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-700">
              Stay length distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={staySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="groupKey" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="bookings" fill="#0369a1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-700">
              Lead time distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={leadSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="groupKey" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="bookings" fill="#b45309" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-700">
              Arrivals by weekday
            </CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdayArrival}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="groupKey" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="bookings" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-700">
              Departures by weekday
            </CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdayDeparture}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="groupKey" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="bookings" fill="#7c3aed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-700">Seasonality (by month)</CardTitle>
        </CardHeader>
        <CardContent className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="groupKey" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="bookings" fill="#0f766e" name="Bookings" radius={[4, 4, 0, 0]} />
              <Bar dataKey="grossRevenue" fill="#0369a1" name="Gross £" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Occupancy — reuse existing DemandCurve */}
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-700">
            Occupancy / demand trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DemandCurve tenantId={tenantId} tenantTimezone={timezone} />
        </CardContent>
      </Card>

      {/* Report builder sheet */}
      <Sheet open={builderOpen} onOpenChange={setBuilderOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Report builder</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div className="space-y-1">
              <Label>Group by</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={builderGroupBy}
                onChange={(e) => setBuilderGroupBy(e.target.value as GroupBy)}
              >
                {GROUP_BY.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <Button type="button" onClick={() => void runBuilder()} disabled={builderLoading}>
              {builderLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Run report
            </Button>
            <div className="max-h-64 overflow-auto rounded border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-slate-50 text-left">
                    <th className="p-2">Group</th>
                    <th className="p-2">Bookings</th>
                    <th className="p-2">Gross</th>
                  </tr>
                </thead>
                <tbody>
                  {builderRows.map((r) => (
                    <tr key={r.groupKey} className="border-b">
                      <td className="p-2">{r.groupKey}</td>
                      <td className="p-2 tabular-nums">{r.bookings}</td>
                      <td className="p-2 tabular-nums">{money(r.grossRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Save as…"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={() => void saveReport()}>
                <Save className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500">Saved reports</p>
              {savedReports.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded border px-2 py-1.5 text-sm"
                >
                  <button
                    type="button"
                    className="text-left text-teal-800 hover:underline"
                    onClick={() => applySaved(r)}
                  >
                    {r.name}
                  </button>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-red-600"
                    onClick={() => void deleteReport(r.id)}
                    aria-label={`Delete ${r.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Export modal */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Export CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {(
              [
                ['standard', 'Standard'],
                ['finance', 'Finance'],
                ['anonymised', 'Anonymised (AI-safe)'],
                ['custom', 'Custom'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="preset"
                  checked={exportPreset === value}
                  onChange={() => setExportPreset(value)}
                />
                {label}
              </label>
            ))}
            {exportPreset === 'anonymised' ? (
              <p className="text-xs text-slate-500">
                Server whitelist only — customer name, email, phone, and plate are never included.
              </p>
            ) : null}
            {exportPreset === 'custom' ? (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded border p-2">
                {ALL_EXPORT_FIELDS.map((field) => {
                  const isPii = (PII_EXPORT_FIELDS as readonly string[]).includes(field);
                  return (
                    <label key={field} className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={customFields.includes(field)}
                        onCheckedChange={(v) => toggleCustomField(field, v === true)}
                      />
                      <span className={isPii ? 'text-amber-700' : ''}>
                        {field}
                        {isPii ? ' (PII — audited)' : ''}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setExportOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void doExport()} disabled={exporting}>
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Download CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
