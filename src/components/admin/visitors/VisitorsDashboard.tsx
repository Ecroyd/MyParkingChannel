"use client";

// Admin > Visitors: who is on the booking site now, how many people visited, where they came from
// and which sources go on to checkout. Data from /api/admin/visitors.

import { useCallback, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/admin/KpiCard";
import type { LiveVisitors, VisitorStats } from "@/lib/visitors/server";

const RANGES = [
  { days: 1, label: "24 hours" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

const LIVE_REFRESH_MS = 30_000;

const nf = new Intl.NumberFormat("en-GB");
const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "–");

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en-GB"], { type: "region" });
  } catch {
    return null;
  }
})();
const countryName = (code: string | null) => {
  if (!code || code === "??") return "Unknown";
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
};

function ago(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
}

function Table<T>({
  title,
  rows,
  cols,
  empty = "Nothing yet",
}: {
  title: string;
  rows: T[];
  cols: Array<{ label: string; cell: (r: T) => React.ReactNode; align?: "right" }>;
  empty?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">{empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-500">
                  {cols.map((c) => (
                    <th key={c.label} className={`py-2 pr-3 font-medium ${c.align === "right" ? "text-right" : ""}`}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {cols.map((c) => (
                      <td
                        key={c.label}
                        className={`py-2 pr-3 ${c.align === "right" ? "text-right tabular-nums" : "max-w-[260px] truncate"}`}
                      >
                        {c.cell(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function VisitorsDashboard() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<VisitorStats | null>(null);
  const [live, setLive] = useState<LiveVisitors | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async (d: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/visitors?days=${d}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load visitors");
      setStats(json.stats);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLive = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/visitors?live=1", { cache: "no-store" });
      if (res.ok) setLive((await res.json()).live);
    } catch {
      /* keep last */
    }
  }, []);

  useEffect(() => {
    void loadStats(days);
  }, [days, loadStats]);

  useEffect(() => {
    void loadLive();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadLive();
    }, LIVE_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [loadLive]);

  const t = stats?.totals;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border bg-white p-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                days === r.days ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {loading ? <span className="text-sm text-slate-500">Loading…</span> : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{error}</div>
      ) : null}

      <Card className="border-emerald-200">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            On the site now: {live ? nf.format(live.count) : "–"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!live || live.visitors.length === 0 ? (
            <p className="text-sm text-slate-500">No one in the last 5 minutes. Updates every 30 seconds.</p>
          ) : (
            <ul className="divide-y text-sm">
              {live.visitors.map((v, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-medium text-slate-800">{v.path}</span>
                  <span className="text-slate-500">
                    from {v.source} · {countryName(v.country)} · {v.device ?? "desktop"} · {ago(v.last_seen)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard title="Visitors" value={t ? nf.format(t.visitors) : "–"} hint="People, counted once a day" />
        <KpiCard title="Visits" value={t ? nf.format(t.visits) : "–"} hint="Arrivals from outside the site" />
        <KpiCard title="Page views" value={t ? nf.format(t.pageviews) : "–"} />
        <KpiCard
          title="Went to checkout"
          value={t ? nf.format(t.checkouts) : "–"}
          hint={t ? `${pct(t.checkouts, t.visitors)} of visitors` : undefined}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Visitors per day</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          {stats && stats.daily.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={(d: string) => d.slice(8, 10) + "/" + d.slice(5, 7)}
                  fontSize={12}
                />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip
                  labelFormatter={(d) => new Date(String(d)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                />
                <Bar dataKey="visitors" name="Visitors" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
                <Bar dataKey="checkouts" name="Went to checkout" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-500">No visits recorded in this period yet.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Table
          title="Where visitors came from"
          rows={stats?.sources ?? []}
          cols={[
            { label: "Source", cell: (r) => r.source },
            { label: "Type", cell: (r) => r.medium },
            { label: "Visitors", cell: (r) => nf.format(r.visitors), align: "right" },
            { label: "Checkout", cell: (r) => nf.format(r.checkouts), align: "right" },
            { label: "Rate", cell: (r) => pct(r.checkouts, r.visitors), align: "right" },
          ]}
        />
        <Table
          title="Referring sites"
          rows={stats?.referrers ?? []}
          cols={[
            { label: "Site", cell: (r) => r.referrer_host },
            { label: "Visits", cell: (r) => nf.format(r.visits), align: "right" },
          ]}
        />
        <Table
          title="Landing pages"
          rows={stats?.landing_pages ?? []}
          cols={[
            { label: "Page", cell: (r) => r.path },
            { label: "Visits", cell: (r) => nf.format(r.visits), align: "right" },
          ]}
        />
        <Table
          title="Most viewed pages"
          rows={stats?.pages ?? []}
          cols={[
            { label: "Page", cell: (r) => r.path },
            { label: "Views", cell: (r) => nf.format(r.pageviews), align: "right" },
            { label: "Visitors", cell: (r) => nf.format(r.visitors), align: "right" },
          ]}
        />
        <Table
          title="Campaigns (UTM)"
          rows={stats?.campaigns ?? []}
          empty="No tagged links yet. Add ?utm_source=…&utm_campaign=… to ad and email links to see them here."
          cols={[
            { label: "Campaign", cell: (r) => r.campaign },
            { label: "Source", cell: (r) => r.source },
            { label: "Visits", cell: (r) => nf.format(r.visits), align: "right" },
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <Table
            title="Countries"
            rows={stats?.countries ?? []}
            cols={[
              { label: "Country", cell: (r) => countryName(r.country) },
              { label: "Visitors", cell: (r) => nf.format(r.visitors), align: "right" },
            ]}
          />
          <Table
            title="Devices"
            rows={stats?.devices ?? []}
            cols={[
              { label: "Device", cell: (r) => r.device.charAt(0).toUpperCase() + r.device.slice(1) },
              { label: "Visitors", cell: (r) => nf.format(r.visitors), align: "right" },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
