"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import DateRangeModal from '@/components/admin/DateRangeModal';
import { useDateRangeModal } from '@/hooks/useDateRangeModal';
import { colorForSourceKey } from '@/lib/supplier/chartColors';
import { getSourceLabel } from '@/lib/supplier/labels';

type DemandDayApi = {
  date: string;
  bookedDemand: number;
  actualOccupancy: number;
  arrivals: number;
  departures: number;
  capacity: number | null;
  occupancyPercent: number | null;
  bySource: Record<string, number>;
  countedRefs?: string[];
  excludedCancelledRefs?: string[];
  excludedNoShowRefs?: string[];
};

type DayRow = {
  date: string;
  capacity: number;
  bookedDemand: number;
  actualOccupancy: number;
  arrivals: number;
  departures: number;
  occupancyPercent: number | null;
  countedRefs?: string[];
  excludedCancelledRefs?: string[];
  excludedNoShowRefs?: string[];
  [channelKey: string]: number | string | string[] | null | undefined;
};

function DemandDebugTooltip({
  active,
  payload,
  label,
  debug,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: DayRow }>;
  label?: string | number;
  debug?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 text-xs shadow-lg max-w-xs">
      <p className="font-semibold text-slate-900 mb-2">
        {label != null ? format(new Date(String(label)), "EEE d MMM yyyy") : row.date}
      </p>
      <div className="space-y-1 text-slate-700">
        <p>Booked demand: <span className="font-medium">{row.bookedDemand}</span></p>
        <p>Actual occupancy: <span className="font-medium">{row.actualOccupancy}</span></p>
        <p>Arrivals: {row.arrivals} · Departures: {row.departures}</p>
        <p>Capacity: {row.capacity}</p>
        {row.occupancyPercent != null && (
          <p>Occupancy: {row.occupancyPercent}%</p>
        )}
      </div>
      {debug && (
        <div className="mt-2 border-t border-slate-100 pt-2 space-y-1 text-slate-500">
          {row.countedRefs && (
            <p>Counted ({row.countedRefs.length}): {row.countedRefs.slice(0, 8).join(', ')}{row.countedRefs.length > 8 ? '…' : ''}</p>
          )}
          {row.excludedCancelledRefs && row.excludedCancelledRefs.length > 0 && (
            <p>Excluded cancelled: {row.excludedCancelledRefs.slice(0, 5).join(', ')}</p>
          )}
          {row.excludedNoShowRefs && row.excludedNoShowRefs.length > 0 && (
            <p>Excluded no-show (from actual only): {row.excludedNoShowRefs.slice(0, 5).join(', ')}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function DemandCurve({
  tenantId,
  tenantTimezone = 'Europe/London',
  capacity,
  capacityByDate,
  showCapacityLine = true,
  showDebug = false,
}: {
  tenantId: string;
  tenantTimezone?: string;
  capacity?: number;
  capacityByDate?: Record<string, number | null>;
  showCapacityLine?: boolean;
  showDebug?: boolean;
}) {
  const [days, setDays] = useState<DemandDayApi[]>([]);
  const [apiDebug, setApiDebug] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('next14days');
  const { isOpen, closeModal, handleDateRangeChange } = useDateRangeModal();
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const getDateRange = () => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    switch (dateRange) {
      case 'next7days': {
        const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        return { from: todayStr, to: nextWeek.toISOString().split('T')[0] };
      }
      case 'next30days': {
        const nextMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
        return { from: todayStr, to: nextMonth.toISOString().split('T')[0] };
      }
      case 'next90days': {
        const nextQuarter = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
        return { from: todayStr, to: nextQuarter.toISOString().split('T')[0] };
      }
      case 'custom':
        if (customStartDate && customEndDate && new Date(customStartDate) <= new Date(customEndDate)) {
          return { from: customStartDate, to: customEndDate };
        }
        break;
      case 'next14days':
      default: {
        const nextTwoWeeks = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
        return { from: todayStr, to: nextTwoWeeks.toISOString().split('T')[0] };
      }
    }

    const fallback = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
    return { from: todayStr, to: fallback.toISOString().split('T')[0] };
  };

  const { from, to } = getDateRange();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const debugParam = showDebug ? '&debug=1' : '';
        const response = await fetch(
          `/api/analytics/demand-curve?from=${from}&to=${to}&tenant_id=${tenantId}${debugParam}`
        );
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        setDays(result.days || []);
        setApiDebug(Boolean(result.debug));
      } catch (error) {
        console.error("Error fetching demand curve:", error);
        setDays([]);
      }
      setLoading(false);
    })();
  }, [from, to, tenantId, showDebug]);

  const defaultCapacity = capacity ?? 100;
  const effectiveCapacityByDate = capacityByDate ?? {};

  const { data, channelKeys, maxY, channelNameMap } = useMemo(() => {
    const chSet = new Set<string>();
    const nameMap = new Map<string, string>();
    const rows: DayRow[] = [];

    for (const day of days) {
      const dayCapacity =
        effectiveCapacityByDate[day.date] ?? day.capacity ?? defaultCapacity;
      const row: DayRow = {
        date: day.date,
        capacity: dayCapacity,
        bookedDemand: day.bookedDemand,
        actualOccupancy: day.actualOccupancy,
        arrivals: day.arrivals,
        departures: day.departures,
        occupancyPercent: day.occupancyPercent,
        countedRefs: day.countedRefs,
        excludedCancelledRefs: day.excludedCancelledRefs,
        excludedNoShowRefs: day.excludedNoShowRefs,
      };

      for (const [sourceKey, count] of Object.entries(day.bySource ?? {})) {
        chSet.add(sourceKey);
        nameMap.set(sourceKey, getSourceLabel(sourceKey));
        row[sourceKey] = count;
      }

      rows.push(row);
    }

    let m = 0;
    for (const r of rows) {
      m = Math.max(m, r.bookedDemand, r.capacity);
    }

    return {
      data: rows,
      channelKeys: Array.from(chSet).sort(),
      maxY: Math.max(5, m),
      channelNameMap: nameMap,
    };
  }, [days, defaultCapacity, effectiveCapacityByDate]);

  if (loading) {
    return (
      <div className="w-full h-[320px] flex items-center justify-center text-muted-foreground">
        Loading booked demand…
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="w-full h-[320px] flex items-center justify-center text-muted-foreground">
        No bookings in this range.
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="dateRange" className="text-sm font-medium text-gray-700">
            Booked demand view:
          </label>
          <select
            id="dateRange"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="next7days">Next 7 days</option>
            <option value="next14days">Next 14 days</option>
            <option value="next30days">Next 30 days</option>
            <option value="next90days">Next 90 days</option>
            <option value="custom">Custom range</option>
          </select>
        </div>

        {dateRange === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              min={customStartDate || undefined}
            />
          </div>
        )}

        <div className="text-sm text-gray-600">
          {format(new Date(from), 'MMM d')} – {format(new Date(to), 'MMM d, yyyy')}
          <span className="text-gray-400 ml-1">({tenantTimezone})</span>
        </div>
      </div>

      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => format(new Date(d), "dd MMM")}
              minTickGap={24}
            />
            <YAxis domain={[0, maxY]} />
            <Tooltip
              content={(props) => (
                <DemandDebugTooltip {...props} debug={showDebug && apiDebug} />
              )}
            />
            <Legend />

            {channelKeys.map((ck) => {
              const displayName = channelNameMap.get(ck) || ck.replace(/_/g, " ");
              return (
                <Bar
                  key={ck}
                  dataKey={ck}
                  stackId="demand"
                  fill={colorForSourceKey(ck)}
                  name={displayName}
                  maxBarSize={28}
                />
              );
            })}

            <Line
              type="monotone"
              dataKey="bookedDemand"
              stroke="#0f172a"
              strokeWidth={2}
              dot={false}
              name="Booked demand"
            />

            {showCapacityLine && (
              <Line
                type="monotone"
                dataKey="capacity"
                stroke="#94a3b8"
                strokeDasharray="4 4"
                dot={false}
                name="Capacity"
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <DateRangeModal
        isOpen={isOpen}
        onClose={closeModal}
        onDateRangeChange={handleDateRangeChange}
        title="Select date range for booked demand"
      />
    </div>
  );
}
