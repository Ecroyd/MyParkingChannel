"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import {
  summarizeOccupancyPoints,
  type OccupancyDataQuality,
  type OccupancyPoint,
  type CurrentOccupancyResult,
} from "@/lib/analytics/occupancyTimeseries";
import {
  computeOccupancyYDomain,
  readStoredOccupancyScaleMode,
  writeStoredOccupancyScaleMode,
  type OccupancyScaleMode,
} from "@/lib/analytics/occupancyChartScale";

type ApiResponse = {
  intervalMinutes: number;
  timezone: string;
  from: string;
  to: string;
  points: OccupancyPoint[];
  dataQuality?: OccupancyDataQuality;
  reliableFrom?: string | null;
  baselineAt?: string | null;
  actualUnavailableBeforeBaseline?: boolean;
  currentOccupancy?: CurrentOccupancyResult;
  error?: string;
};

type ChartRow = {
  timestamp: string;
  expected: number;
  actual: number | null;
  capacity: number | null;
  label: string;
};

function formatLocalDateTime(iso: string, timezone: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatAxisTick(iso: string, timezone: string, daySpan: number): string {
  const d = new Date(iso);
  if (daySpan <= 1) {
    return d.toLocaleTimeString("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  if (daySpan <= 7) {
    return d.toLocaleString("en-GB", {
      timeZone: timezone,
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return d.toLocaleDateString("en-GB", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
  });
}

function formatVariance(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (value > 0) return `+${value}`;
  return String(value);
}

function OccupancyTooltip({
  active,
  payload,
  timezone,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ChartRow }>;
  timezone: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const variance = row.actual == null ? null : row.actual - row.expected;
  const occupancyPct =
    row.capacity && row.capacity > 0 && row.actual != null
      ? Math.round((row.actual / row.capacity) * 1000) / 10
      : null;

  return (
    <div className="rounded-md border border-border bg-background p-3 text-xs shadow-lg">
      <p className="mb-2 font-semibold text-foreground">
        {formatLocalDateTime(row.timestamp, timezone)}
      </p>
      <div className="space-y-1 text-muted-foreground">
        <p>
          Expected: <span className="font-medium text-foreground">{row.expected}</span>
        </p>
        <p>
          Actual:{" "}
          <span className="font-medium text-foreground">
            {row.actual == null ? "—" : row.actual}
          </span>
        </p>
        <p>
          Variance:{" "}
          <span className="font-medium text-foreground">{formatVariance(variance)}</span>
        </p>
        <p>
          Capacity:{" "}
          <span className="font-medium text-foreground">
            {row.capacity == null ? "—" : row.capacity}
          </span>
        </p>
        {occupancyPct != null && (
          <p>
            Actual occupancy:{" "}
            <span className="font-medium text-foreground">{occupancyPct}%</span>
          </p>
        )}
      </div>
    </div>
  );
}

export type OccupancyTimelineChartProps = {
  tenantId: string;
  from: string;
  to: string;
  tenantTimezone?: string;
  refreshKey?: number;
  onCurrentOccupancy?: (count: number) => void;
};

export default function OccupancyTimelineChart({
  tenantId,
  from,
  to,
  tenantTimezone = "Europe/London",
  refreshKey = 0,
  onCurrentOccupancy,
}: OccupancyTimelineChartProps) {
  const [points, setPoints] = useState<OccupancyPoint[]>([]);
  const [timezone, setTimezone] = useState(tenantTimezone);
  const [dataQuality, setDataQuality] = useState<OccupancyDataQuality | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [yScaleMode, setYScaleMode] = useState<OccupancyScaleMode>('full');
  const previousPointsRef = useRef<OccupancyPoint[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setYScaleMode(readStoredOccupancyScaleMode());
  }, []);

  const toggleYScaleMode = useCallback(() => {
    setYScaleMode((prev) => {
      const next: OccupancyScaleMode = prev === 'full' ? 'focused' : 'full';
      writeStoredOccupancyScaleMode(next);
      return next;
    });
  }, []);

  const fetchSeries = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ from, to, tenant_id: tenantId });
      const res = await fetch(`/api/admin/occupancy-timeseries?${params}`, {
        signal: controller.signal,
      });
      const json = (await res.json()) as ApiResponse;
      if (!res.ok) throw new Error(json.error || "Failed to load occupancy");
      setPoints(json.points ?? []);
      previousPointsRef.current = json.points ?? [];
      setTimezone(json.timezone || tenantTimezone);
      setDataQuality(json.dataQuality ?? null);
      if (json.currentOccupancy && onCurrentOccupancy) {
        onCurrentOccupancy(json.currentOccupancy.occupiedCount);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load occupancy");
      if (previousPointsRef.current.length > 0) setPoints(previousPointsRef.current);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [from, to, tenantId, tenantTimezone, onCurrentOccupancy]);

  useEffect(() => {
    void fetchSeries();
    return () => abortRef.current?.abort();
  }, [fetchSeries, refreshKey]);

  useEffect(() => {
    const onFocus = () => {
      void fetchSeries();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchSeries]);

  const daySpan = useMemo(() => {
    const start = new Date(`${from}T00:00:00Z`).getTime();
    const end = new Date(`${to}T00:00:00Z`).getTime();
    return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
  }, [from, to]);

  const chartData: ChartRow[] = useMemo(
    () =>
      points.map((p) => ({
        timestamp: p.timestamp,
        expected: p.expected,
        actual: p.actual,
        capacity: p.capacity,
        label: formatAxisTick(p.timestamp, timezone, daySpan),
      })),
    [points, timezone, daySpan]
  );

  const capacityValues = useMemo(
    () => chartData.map((r) => r.capacity).filter((c): c is number => c != null),
    [chartData]
  );
  const uniqueCapacities = useMemo(() => new Set(capacityValues), [capacityValues]);
  const showFlatCapacity = uniqueCapacities.size === 1;
  const flatCapacity = showFlatCapacity ? capacityValues[0] : null;

  const summary = useMemo(() => summarizeOccupancyPoints(points), [points]);

  const yDomain = useMemo(
    () =>
      computeOccupancyYDomain(
        yScaleMode,
        chartData.map((r) => ({
          expected: r.expected,
          actual: r.actual,
          capacity: r.capacity,
        }))
      ),
    [chartData, yScaleMode]
  );

  const nowMs = Date.now();
  const showNowMarker =
    chartData.length > 0 &&
    new Date(chartData[0].timestamp).getTime() <= nowMs &&
    new Date(chartData[chartData.length - 1].timestamp).getTime() >= nowMs - 30 * 60_000;

  const xTicks = useMemo(() => {
    if (daySpan <= 1) {
      return chartData
        .filter((row) => new Date(row.timestamp).getUTCMinutes() === 0)
        .map((row) => row.timestamp);
    }
    return undefined;
  }, [chartData, daySpan]);

  const qualityParts: string[] = [];
  if (dataQuality?.missingArrivalDespiteOnSite) {
    qualityParts.push(
      `${dataQuality.missingArrivalDespiteOnSite} on-site without arrival timestamp`
    );
  }
  if (dataQuality?.keyRequiredNotArrived) {
    qualityParts.push(
      `${dataQuality.keyRequiredNotArrived} key required — not yet arrived`
    );
  }
  if (dataQuality?.departedButMarkedOnSite) {
    qualityParts.push(
      `${dataQuality.departedButMarkedOnSite} departed but still marked on-site`
    );
  }
  if (dataQuality?.openButCancelledOrNoShow) {
    qualityParts.push(
      `${dataQuality.openButCancelledOrNoShow} open but cancelled/no-show`
    );
  }
  if (dataQuality?.negativeOccupancyDetected) {
    qualityParts.push("impossible negative occupancy detected");
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Car park occupancy</CardTitle>
            <CardDescription>
              Expected and recorded vehicles at 30-minute intervals
            </CardDescription>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <TooltipProvider>
                <UiTooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={toggleYScaleMode}
                      aria-pressed={yScaleMode === 'focused'}
                      aria-label="Zoom Y-axis. Zooms the vertical scale to make smaller occupancy changes easier to see. The underlying vehicle counts are unchanged."
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        yScaleMode === 'focused'
                          ? 'border-slate-700 bg-slate-800 text-white'
                          : 'border-border bg-background text-foreground hover:bg-muted'
                      }`}
                    >
                      Zoom Y-axis
                      {yScaleMode === 'focused' ? ' · Focused' : ' · Full'}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Zooms the vertical scale to make smaller occupancy changes easier to see. The
                    underlying vehicle counts are unchanged.
                  </TooltipContent>
                </UiTooltip>
              </TooltipProvider>
              {yScaleMode === 'focused' && (
                <span className="rounded border border-slate-400/50 bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Focused scale
                </span>
              )}
            </div>
            {summary && (
              <div className="flex flex-wrap gap-3 text-xs sm:text-sm text-muted-foreground">
                {summary.mode === "now" ? (
                  <>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide">Actual now</span>
                      <span className="font-semibold text-foreground">
                        {summary.actualNow == null ? "—" : summary.actualNow}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide">Expected now</span>
                      <span className="font-semibold text-foreground">{summary.expectedNow}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide">Variance</span>
                      <span className="font-semibold text-foreground">
                        {formatVariance(summary.variance)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide">Capacity</span>
                      <span className="font-semibold text-foreground">
                        {summary.capacity == null ? "—" : summary.capacity}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide">Peak actual</span>
                      <span className="font-semibold text-foreground">
                        {summary.peakActual == null ? "—" : summary.peakActual}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide">Peak expected</span>
                      <span className="font-semibold text-foreground">{summary.peakExpected}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide">Largest variance</span>
                      <span className="font-semibold text-foreground">
                        {summary.largestVariance == null ? "—" : summary.largestVariance}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && points.length === 0 ? (
          <div className="h-72 w-full animate-pulse rounded-md bg-muted/60" />
        ) : error && points.length === 0 ? (
          <div className="flex h-72 items-center justify-center rounded-md border border-destructive/30 bg-destructive/5 px-4 text-sm text-destructive">
            {error}
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-72 items-center justify-center rounded-md border border-dashed border-border px-4 text-sm text-muted-foreground">
            No occupancy data for this date range.
          </div>
        ) : (
          <div className={`h-72 w-full ${loading ? "opacity-70" : ""}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="timestamp"
                  ticks={xTicks}
                  interval={xTicks ? 0 : Math.max(0, Math.floor(chartData.length / 12) - 1)}
                  tickFormatter={(value) => formatAxisTick(String(value), timezone, daySpan)}
                  minTickGap={28}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                  width={40}
                  domain={yDomain}
                />
                <Tooltip content={<OccupancyTooltip timezone={timezone} />} />
                <Legend />
                {showFlatCapacity && flatCapacity != null && (
                  <ReferenceLine
                    y={flatCapacity}
                    stroke="#94a3b8"
                    strokeOpacity={0.45}
                    strokeDasharray="2 4"
                    label={{ value: "Capacity", position: "insideTopRight", fill: "#94a3b8", fontSize: 10 }}
                  />
                )}
                {!showFlatCapacity && (
                  <Line
                    type="stepAfter"
                    dataKey="capacity"
                    name="Capacity"
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                    strokeOpacity={0.55}
                    strokeDasharray="2 4"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                )}
                <Line
                  type="stepAfter"
                  dataKey="expected"
                  name="Expected"
                  stroke="#64748b"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="stepAfter"
                  dataKey="actual"
                  name="Actual"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
                {showNowMarker && (
                  <ReferenceLine
                    x={
                      chartData.reduce<string | null>((best, row) => {
                        const t = new Date(row.timestamp).getTime();
                        if (t > nowMs) return best;
                        if (!best) return row.timestamp;
                        return t >= new Date(best).getTime() ? row.timestamp : best;
                      }, null) ?? undefined
                    }
                    stroke="#0f172a"
                    strokeOpacity={0.35}
                    strokeDasharray="4 4"
                    label={{ value: "Now", position: "top", fontSize: 10 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <TooltipProvider>
            <UiTooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-sm hover:text-foreground"
                  aria-label="About actual occupancy"
                >
                  <Info className="h-3.5 w-3.5" />
                  <span>
                    Actual is how many vehicles are parked according to the app (same rules as
                    Currently Parked). Future times show as blank.
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Expected uses scheduled booking intervals. Actual counts vehicles on site from
                arrival until departure, matching the Currently Parked KPI at “now”.
              </TooltipContent>
            </UiTooltip>
          </TooltipProvider>
          {qualityParts.length > 0 && (
            <span className="text-amber-700 dark:text-amber-400">{qualityParts.join(" · ")}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
