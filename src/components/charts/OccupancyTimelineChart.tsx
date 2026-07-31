"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info, ScanSearch } from "lucide-react";
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

const COLORS = {
  actual: "#2563eb",
  expected: "#64748b",
  capacity: "#94a3b8",
  now: "#0f172a",
  grid: "#e5e7eb",
  axis: "#9ca3af",
} as const;

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

function varianceTone(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value) || value === 0) return "text-gray-900";
  if (value > 0) return "text-amber-700";
  return "text-emerald-700";
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

  const rows: Array<{ label: string; value: string; swatch?: string; tone?: string }> = [
    { label: "Expected", value: String(row.expected), swatch: COLORS.expected },
    {
      label: "Actual",
      value: row.actual == null ? "—" : String(row.actual),
      swatch: COLORS.actual,
    },
    {
      label: "Variance",
      value: formatVariance(variance),
      tone: varianceTone(variance),
    },
    {
      label: "Capacity",
      value: row.capacity == null ? "—" : String(row.capacity),
      swatch: COLORS.capacity,
    },
  ];
  if (occupancyPct != null) {
    rows.push({ label: "Occupancy", value: `${occupancyPct}%` });
  }

  return (
    <div className="min-w-[180px] rounded-xl border border-gray-200/80 bg-white/95 p-3 text-xs shadow-xl shadow-gray-900/10 backdrop-blur-sm">
      <p className="mb-2.5 border-b border-gray-100 pb-2 font-semibold text-gray-900">
        {formatLocalDateTime(row.timestamp, timezone)}
      </p>
      <div className="space-y-1.5">
        {rows.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-gray-500">
              {item.swatch && (
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: item.swatch }}
                  aria-hidden
                />
              )}
              {item.label}
            </span>
            <span className={`font-semibold tabular-nums ${item.tone ?? "text-gray-900"}`}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricChip({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string | number;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-[4.5rem] rounded-lg border border-gray-100 bg-gray-50/80 px-2.5 py-1.5">
      <span className="block text-[10px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </span>
      <span className={`text-sm font-semibold tabular-nums ${valueClassName ?? "text-gray-900"}`}>
        {value}
      </span>
    </div>
  );
}

function LegendSwatch({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-600">
      <span
        className="inline-block h-0.5 w-4 rounded-full"
        style={{
          backgroundColor: dashed ? "transparent" : color,
          borderTop: dashed ? `2px dashed ${color}` : undefined,
          height: dashed ? 0 : undefined,
        }}
        aria-hidden
      />
      {label}
    </span>
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
  const [yScaleMode, setYScaleMode] = useState<OccupancyScaleMode>("full");
  const previousPointsRef = useRef<OccupancyPoint[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  // Held in a ref so an unstable parent callback cannot re-create fetchSeries,
  // which would re-trigger the fetch effect on every parent render.
  const onCurrentOccupancyRef = useRef(onCurrentOccupancy);
  onCurrentOccupancyRef.current = onCurrentOccupancy;

  useEffect(() => {
    setYScaleMode(readStoredOccupancyScaleMode());
  }, []);

  const toggleYScaleMode = useCallback(() => {
    setYScaleMode((prev) => {
      const next: OccupancyScaleMode = prev === "full" ? "focused" : "full";
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
      if (json.currentOccupancy) {
        onCurrentOccupancyRef.current?.(json.currentOccupancy.occupiedCount);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load occupancy");
      if (previousPointsRef.current.length > 0) setPoints(previousPointsRef.current);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [from, to, tenantId, tenantTimezone]);

  useEffect(() => {
    void fetchSeries();
    return () => abortRef.current?.abort();
  }, [fetchSeries, refreshKey]);

  const fetchSeriesRef = useRef(fetchSeries);
  fetchSeriesRef.current = fetchSeries;

  // Poll every 30 minutes, and only while the tab is visible.
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void fetchSeriesRef.current();
    }, 30 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, []);

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

  const nowTimestamp = useMemo(() => {
    if (!showNowMarker) return undefined;
    return (
      chartData.reduce<string | null>((best, row) => {
        const t = new Date(row.timestamp).getTime();
        if (t > nowMs) return best;
        if (!best) return row.timestamp;
        return t >= new Date(best).getTime() ? row.timestamp : best;
      }, null) ?? undefined
    );
  }, [chartData, nowMs, showNowMarker]);

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
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm shadow-gray-900/[0.03]">
      <div className="border-b border-gray-100 bg-gradient-to-br from-slate-50/80 via-white to-blue-50/30 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight text-gray-900">
                Car park occupancy
              </h2>
              {yScaleMode === "focused" && (
                <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600 shadow-sm">
                  Focused scale
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-gray-500">
              Expected vs parked vehicles · 30-minute intervals
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <TooltipProvider>
                <UiTooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={toggleYScaleMode}
                      aria-pressed={yScaleMode === "focused"}
                      aria-label="Zoom Y-axis. Zooms the vertical scale to make smaller occupancy changes easier to see. The underlying vehicle counts are unchanged."
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                        yScaleMode === "focused"
                          ? "border-slate-800 bg-slate-900 text-white shadow-sm"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <ScanSearch className="h-3.5 w-3.5 opacity-80" aria-hidden />
                      Zoom Y-axis
                      <span className="opacity-70">
                        {yScaleMode === "focused" ? "Focused" : "Full"}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Zooms the vertical scale to make smaller occupancy changes easier to see. The
                    underlying vehicle counts are unchanged.
                  </TooltipContent>
                </UiTooltip>
              </TooltipProvider>
            </div>

            {summary && (
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {summary.mode === "now" ? (
                  <>
                    <MetricChip
                      label="Actual now"
                      value={summary.actualNow == null ? "—" : summary.actualNow}
                      valueClassName="text-blue-700"
                    />
                    <MetricChip label="Expected now" value={summary.expectedNow} />
                    <MetricChip
                      label="Variance"
                      value={formatVariance(summary.variance)}
                      valueClassName={varianceTone(summary.variance)}
                    />
                    <MetricChip
                      label="Capacity"
                      value={summary.capacity == null ? "—" : summary.capacity}
                    />
                  </>
                ) : (
                  <>
                    <MetricChip
                      label="Peak actual"
                      value={summary.peakActual == null ? "—" : summary.peakActual}
                      valueClassName="text-blue-700"
                    />
                    <MetricChip label="Peak expected" value={summary.peakExpected} />
                    <MetricChip
                      label="Largest variance"
                      value={
                        summary.largestVariance == null ? "—" : summary.largestVariance
                      }
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
        {loading && points.length === 0 ? (
          <div className="h-80 w-full animate-pulse rounded-lg bg-gradient-to-br from-gray-50 to-gray-100/80" />
        ) : error && points.length === 0 ? (
          <div className="flex h-80 items-center justify-center rounded-lg border border-red-200 bg-red-50 px-4 text-sm text-red-700">
            {error}
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-80 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50/50 px-4 text-sm text-gray-500">
            No occupancy data for this date range.
          </div>
        ) : (
          <div
            className={`rounded-lg border border-gray-100 bg-gradient-to-b from-white to-slate-50/40 p-2 sm:p-3 ${
              loading ? "opacity-70" : ""
            }`}
          >
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
              <LegendSwatch color={COLORS.actual} label="Actual" />
              <LegendSwatch color={COLORS.expected} label="Expected" dashed />
              <LegendSwatch color={COLORS.capacity} label="Capacity" dashed />
            </div>
            <div className="h-72 w-full sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 12, right: 16, left: 0, bottom: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 6"
                    stroke={COLORS.grid}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="timestamp"
                    ticks={xTicks}
                    interval={
                      xTicks ? 0 : Math.max(0, Math.floor(chartData.length / 12) - 1)
                    }
                    tickFormatter={(value) =>
                      formatAxisTick(String(value), timezone, daySpan)
                    }
                    minTickGap={28}
                    tick={{ fontSize: 11, fill: COLORS.axis }}
                    axisLine={{ stroke: COLORS.grid }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: COLORS.axis }}
                    width={36}
                    domain={yDomain}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<OccupancyTooltip timezone={timezone} />}
                    cursor={{ stroke: "#cbd5e1", strokeDasharray: "4 4" }}
                  />
                  {showFlatCapacity && flatCapacity != null && (
                    <ReferenceLine
                      y={flatCapacity}
                      stroke={COLORS.capacity}
                      strokeOpacity={0.7}
                      strokeDasharray="2 5"
                      label={{
                        value: "Capacity",
                        position: "insideTopRight",
                        fill: COLORS.capacity,
                        fontSize: 10,
                      }}
                    />
                  )}
                  {!showFlatCapacity && (
                    <Line
                      type="stepAfter"
                      dataKey="capacity"
                      name="Capacity"
                      stroke={COLORS.capacity}
                      strokeWidth={1.5}
                      strokeOpacity={0.7}
                      strokeDasharray="2 5"
                      dot={false}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                  )}
                  <Line
                    type="stepAfter"
                    dataKey="expected"
                    name="Expected"
                    stroke={COLORS.expected}
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    strokeOpacity={0.9}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="actual"
                    name="Actual"
                    stroke={COLORS.actual}
                    strokeWidth={2.75}
                    dot={false}
                    activeDot={{
                      r: 4,
                      strokeWidth: 2,
                      stroke: "#fff",
                      fill: COLORS.actual,
                    }}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                  {nowTimestamp && (
                    <ReferenceLine
                      x={nowTimestamp}
                      stroke={COLORS.now}
                      strokeOpacity={0.28}
                      strokeDasharray="4 4"
                      label={{
                        value: "Now",
                        position: "top",
                        fontSize: 10,
                        fill: "#64748b",
                      }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 px-1 text-xs text-gray-500">
          <TooltipProvider>
            <UiTooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex max-w-full items-center gap-1.5 rounded-md text-left hover:text-gray-800"
                  aria-label="About actual occupancy"
                >
                  <Info className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span>
                    Actual matches Currently Parked — vehicles on site from arrival until
                    departure. Future times stay blank.
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
            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-amber-800">
              {qualityParts.join(" · ")}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
