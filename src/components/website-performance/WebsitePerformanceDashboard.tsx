"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FunnelStage = {
  key: string;
  label: string;
  count: number;
  conversionFromPrevPct: number | null;
  dropOffFromPrevPct: number | null;
  conversionToNextPct: number | null;
  dropOffToNextPct: number | null;
};

type FunnelSummary = {
  stages: FunnelStage[];
  visitorToBookingPct: number | null;
  searchToBookingPct: number | null;
  checkoutToBookingPct: number | null;
  bookingRevenueCents: number;
  averageBookingValueCents: number | null;
  completedBookings: number;
};

type AttributionRow = {
  channel: string;
  visitors: number;
  completedBookings: number;
  revenueCents: number;
};

type MigrationSide = {
  visitors: number;
  organicVisitors: number | null;
  availabilitySearches: number;
  completedBookings: number;
  conversionRatePct: number | null;
  revenueCents: number;
  averageBookingValueCents: number | null;
};

type MigrationComparison = {
  migrationDate: string;
  comparisonDays: number;
  beforeRange: { from: string; to: string };
  afterRange: { from: string; to: string };
  before: MigrationSide;
  after: MigrationSide;
  seasonalityWarning: string | null;
  likeForLike: boolean;
};

const PRESETS = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "custom", label: "Custom" },
] as const;

const CHANNEL_LABELS: Record<string, string> = {
  organic: "Organic Search",
  direct: "Direct",
  referral: "Referral",
  paid: "Paid",
  social: "Social",
  unknown: "Unknown",
};

function money(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(cents / 100);
}

function pct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n}%`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function MigrationColumn({ title, range, side }: { title: string; range: { from: string; to: string }; side: MigrationSide }) {
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500">
          {range.from} → {range.to}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Metric label="Visitors" value={String(side.visitors)} />
        <Metric
          label="Organic visitors"
          value={side.organicVisitors == null ? "Unavailable" : String(side.organicVisitors)}
        />
        <Metric label="Availability searches" value={String(side.availabilitySearches)} />
        <Metric label="Completed bookings" value={String(side.completedBookings)} />
        <Metric label="Conversion rate" value={pct(side.conversionRatePct)} />
        <Metric label="Revenue" value={money(side.revenueCents)} />
        <Metric label="Average booking value" value={money(side.averageBookingValueCents)} />
      </div>
    </div>
  );
}

export default function WebsitePerformanceDashboard({
  tenantName,
  timezone,
}: {
  tenantName: string;
  timezone: string;
}) {
  const [preset, setPreset] = useState<(typeof PRESETS)[number]["id"]>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [funnel, setFunnel] = useState<FunnelSummary | null>(null);
  const [attribution, setAttribution] = useState<AttributionRow[]>([]);
  const [rangeLabel, setRangeLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [migrationMode, setMigrationMode] = useState(false);
  const [migrationDate, setMigrationDate] = useState("");
  const [comparisonDays, setComparisonDays] = useState("30");
  const [migration, setMigration] = useState<MigrationComparison | null>(null);

  const loadFunnel = useCallback(() => {
    startTransition(async () => {
      setError(null);
      const params = new URLSearchParams({ preset });
      if (preset === "custom") {
        if (!from || !to) {
          setError("Choose a custom start and end date.");
          return;
        }
        params.set("from", from);
        params.set("to", to);
      }
      try {
        const res = await fetch(`/api/admin/website-performance?${params}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to load performance data");
          return;
        }
        setFunnel(data.funnel);
        setAttribution(data.attribution || []);
        setRangeLabel(`${data.range.from} → ${data.range.to}`);
      } catch {
        setError("Failed to load performance data");
      }
    });
  }, [preset, from, to]);

  const loadMigration = useCallback(() => {
    startTransition(async () => {
      setError(null);
      if (!migrationDate) {
        setError("Set a migration date.");
        return;
      }
      const params = new URLSearchParams({
        mode: "migration",
        migration_date: migrationDate,
        comparison_days: comparisonDays || "30",
      });
      try {
        const res = await fetch(`/api/admin/website-performance?${params}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to load migration comparison");
          return;
        }
        setMigration(data.comparison);
      } catch {
        setError("Failed to load migration comparison");
      }
    });
  }, [migrationDate, comparisonDays]);

  useEffect(() => {
    if (!migrationMode) loadFunnel();
  }, [migrationMode, loadFunnel]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">
            {tenantName} · {timezone}
          </p>
          {!migrationMode && rangeLabel ? (
            <p className="text-xs text-slate-400">Range: {rangeLabel}</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={migrationMode ? "outline" : "default"}
            onClick={() => setMigrationMode(false)}
          >
            Funnel
          </Button>
          <Button
            type="button"
            variant={migrationMode ? "default" : "outline"}
            onClick={() => setMigrationMode(true)}
          >
            Migration comparison
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {!migrationMode ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            {PRESETS.map((p) => (
              <Button
                key={p.id}
                type="button"
                size="sm"
                variant={preset === p.id ? "default" : "outline"}
                onClick={() => setPreset(p.id)}
              >
                {p.label}
              </Button>
            ))}
            {preset === "custom" ? (
              <>
                <div>
                  <Label htmlFor="from">From</Label>
                  <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="to">To</Label>
                  <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
                <Button type="button" onClick={loadFunnel} disabled={pending}>
                  Apply
                </Button>
              </>
            ) : null}
          </div>

          {funnel ? (
            <>
              <div className="space-y-0">
                {funnel.stages.map((stage, idx) => (
                  <div key={stage.key} className="relative">
                    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-500">{stage.label}</p>
                          <p className="text-3xl font-semibold tracking-tight text-slate-900">
                            {stage.count.toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right text-sm text-slate-600">
                          {stage.conversionToNextPct != null ? (
                            <>
                              <p>{pct(stage.conversionToNextPct)} reach next stage</p>
                              <p className="text-slate-500">{pct(stage.dropOffToNextPct)} drop-off</p>
                            </>
                          ) : (
                            <p className="text-slate-500">Final stage</p>
                          )}
                          {idx > 0 && stage.conversionFromPrevPct != null ? (
                            <p className="mt-1 text-xs text-slate-400">
                              {pct(stage.conversionFromPrevPct)} of previous stage
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {idx < funnel.stages.length - 1 ? (
                      <div className="flex justify-center py-1 text-slate-400" aria-hidden>
                        ↓
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <Metric label="Visitor → booking" value={pct(funnel.visitorToBookingPct)} />
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <Metric label="Search → booking" value={pct(funnel.searchToBookingPct)} />
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <Metric label="Checkout → booking" value={pct(funnel.checkoutToBookingPct)} />
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <Metric label="Booking revenue" value={money(funnel.bookingRevenueCents)} />
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <Metric
                    label="Average booking value"
                    value={money(funnel.averageBookingValueCents)}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="text-base font-semibold text-slate-900">Attribution</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Shown only where source signals were captured. Missing attribution is not guessed.
                </p>
                {attribution.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">No attribution data for this range.</p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-slate-500">
                        <tr>
                          <th className="py-2 pr-4 font-medium">Channel</th>
                          <th className="py-2 pr-4 font-medium">Visitors</th>
                          <th className="py-2 pr-4 font-medium">Bookings</th>
                          <th className="py-2 font-medium">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attribution.map((row) => (
                          <tr key={row.channel} className="border-t border-slate-100">
                            <td className="py-2 pr-4">{CHANNEL_LABELS[row.channel] || row.channel}</td>
                            <td className="py-2 pr-4">{row.visitors.toLocaleString()}</td>
                            <td className="py-2 pr-4">{row.completedBookings.toLocaleString()}</td>
                            <td className="py-2">{money(row.revenueCents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">{pending ? "Loading…" : "No data yet."}</p>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-5">
            <div>
              <Label htmlFor="migrationDate">Migration date</Label>
              <Input
                id="migrationDate"
                type="date"
                value={migrationDate}
                onChange={(e) => setMigrationDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="comparisonDays">Comparison period (days)</Label>
              <Input
                id="comparisonDays"
                type="number"
                min={1}
                max={365}
                value={comparisonDays}
                onChange={(e) => setComparisonDays(e.target.value)}
              />
            </div>
            <Button type="button" onClick={loadMigration} disabled={pending}>
              Compare
            </Button>
          </div>

          {migration ? (
            <>
              {migration.seasonalityWarning ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {migration.seasonalityWarning}
                </div>
              ) : null}
              {!migration.likeForLike ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Period lengths differ — adjust comparison days for a like-for-like view.
                </div>
              ) : null}
              <div className="grid gap-4 lg:grid-cols-2">
                <MigrationColumn title="BEFORE" range={migration.beforeRange} side={migration.before} />
                <MigrationColumn title="AFTER" range={migration.afterRange} side={migration.after} />
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
