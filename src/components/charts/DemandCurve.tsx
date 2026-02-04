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
import { format, eachDayOfInterval } from "date-fns";
import DateRangeModal from '@/components/admin/DateRangeModal';
import { useDateRangeModal } from '@/hooks/useDateRangeModal';
import { Calendar } from 'lucide-react';
import { getSourceLabel } from '@/lib/supplier/labels';

type Booking = {
  start_at: string;  // timestamptz
  end_at: string;    // timestamptz
  source: string | null; // channel enum — group by this only, never external_source
  external_source?: string | null;
  tenant_id?: string;
};

type DayRow = {
  date: string;          // yyyy-MM-dd
  capacity: number;      // capacity for this day
  total: number;         // total occupied cars
  // dynamic channel keys -> counts
  [channelKey: string]: number | string;
};


/** Stable key for recharts: use source enum only (never external_source). */
function keyFromSource(source: string | null): string {
  const s = (source ?? "other").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "other";
  return s;
}

/** Deterministic colour per key (keeps palette stable across renders/tenants) */
const PALETTE = [
  "#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#14b8a6", "#eab308", "#f97316", "#06b6d4", "#84cc16",
  "#ec4899", "#22c55e",
];
const colorFor = (key: string) => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

export default function DemandCurve({
  tenantId,
  capacity, // deprecated: single capacity value (for backward compatibility)
  capacityByDate, // per-date capacity (preferred)
  showCapacityLine = true,
}: {
  tenantId: string;
  capacity?: number; // deprecated, use capacityByDate instead
  capacityByDate?: Record<string, number | null>; // per-date capacity using rolling capacity logic
  showCapacityLine?: boolean;
}) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [fetchedCapacityByDate, setFetchedCapacityByDate] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('next14days');
  const { isOpen, currentDateRange, openModal, closeModal, handleDateRangeChange } = useDateRangeModal();
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Calculate date range
  const getDateRange = () => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    let result;
    switch (dateRange) {
      case 'next7days':
        const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        result = { from: todayStr, to: nextWeek.toISOString().split('T')[0] };
        break;
      case 'next14days':
        const nextTwoWeeks = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
        result = { from: todayStr, to: nextTwoWeeks.toISOString().split('T')[0] };
        break;
      case 'next30days':
        const nextMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
        result = { from: todayStr, to: nextMonth.toISOString().split('T')[0] };
        break;
      case 'next90days':
        const nextQuarter = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
        result = { from: todayStr, to: nextQuarter.toISOString().split('T')[0] };
        break;
      case 'custom':
        // Validate custom dates
        if (!customStartDate || !customEndDate) {
          // Fallback to default if custom dates not set
          const defaultTwoWeeks = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
          result = { from: todayStr, to: defaultTwoWeeks.toISOString().split('T')[0] };
        } else if (new Date(customStartDate) > new Date(customEndDate)) {
          // Fallback to default if invalid range
          const defaultTwoWeeks = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
          result = { from: todayStr, to: defaultTwoWeeks.toISOString().split('T')[0] };
        } else {
          result = { from: customStartDate, to: customEndDate };
        }
        break;
      default:
        const defaultTwoWeeks = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
        result = { from: todayStr, to: defaultTwoWeeks.toISOString().split('T')[0] };
    }
    return result;
  };

  const { from, to } = getDateRange();

  // 1) Fetch bookings that OVERLAP the window:
  // start_at <= to AND end_at >= from
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/bookings/data?from=${from}&to=${to}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        setBookings(result.bookings || []);
      } catch (error) {
        console.error("Error fetching bookings:", error);
        setBookings([]);
      }
      setLoading(false);
    })();
  }, [from, to]);

  // Fetch capacity data for the date range if not provided via props
  useEffect(() => {
    if (capacityByDate) {
      // Capacity provided via props, no need to fetch
      return;
    }

    (async () => {
      try {
        // Generate date range
        const start = new Date(from);
        const end = new Date(to);
        const dates: string[] = [];
        const current = new Date(start);
        while (current <= end) {
          dates.push(current.toISOString().split('T')[0]);
          current.setDate(current.getDate() + 1);
        }

        // Fetch capacity for all dates
        const response = await fetch(`/api/capacity/by-date?tenant_id=${tenantId}&dates=${dates.join(',')}`);
        if (response.ok) {
          const result = await response.json();
          setFetchedCapacityByDate(result.capacityByDate || {});
        }
      } catch (error) {
        console.error("Error fetching capacity data:", error);
      }
    })();
  }, [from, to, tenantId, capacityByDate]);

  // 2) Build day list
  const days = useMemo(() => {
    const start = new Date(from);
    const end = new Date(to);
    
    // Validate date range
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      console.error('Invalid date range:', { from, to });
      return [];
    }
    
    if (start > end) {
      console.error('Start date is after end date:', { from, to });
      return [];
    }
    
    try {
      return eachDayOfInterval({ start, end });
    } catch (error) {
      console.error('Error creating day interval:', error, { from, to });
      return [];
    }
  }, [from, to]);

  // 3) Aggregate per day per channel
  const { data, channelKeys, maxY, channelNameMap } = useMemo(() => {
    const rows: DayRow[] = [];
    const chSet = new Set<string>();
    const nameMap = new Map<string, string>(); // Map normalized key -> display name

    // Use provided capacityByDate or fetched capacityByDate, fallback to single capacity or default
    const effectiveCapacityByDate = capacityByDate || fetchedCapacityByDate;
    const defaultCapacity = capacity ?? 100;

    for (const day of days) {
      const dayStr = format(day, "yyyy-MM-dd");
      // Get capacity for this day from capacityByDate, or use default
      const dayCapacity = effectiveCapacityByDate[dayStr] ?? defaultCapacity;
      const row: DayRow = { date: dayStr, capacity: dayCapacity, total: 0 };

      for (const b of bookings) {
        const s = new Date(b.start_at);
        const e = new Date(b.end_at);

        // Create day boundaries (start and end of day)
        const dayStart = new Date(day);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(day);
        dayEnd.setHours(23, 59, 59, 999);

        // A booking is active on this day if it overlaps with this day
        if (s <= dayEnd && e >= dayStart) {
          // Group by source only (never external_source)
          const sourceKey = keyFromSource(b.source);
          chSet.add(sourceKey);
          nameMap.set(sourceKey, getSourceLabel(b.source));
          row[sourceKey] = (row[sourceKey] as number | undefined ?? 0) + 1;
          row.total += 1;
        }
      }

      rows.push(row);
    }

    let m = 0;
    for (const r of rows) m = Math.max(m, r.total, r.capacity as number);

    return { 
      data: rows, 
      channelKeys: Array.from(chSet).sort(), 
      maxY: Math.max(5, m),
      channelNameMap: nameMap
    };
  }, [bookings, days, capacity, capacityByDate, fetchedCapacityByDate]);

  if (loading) {
    return (
      <div className="w-full h-[320px] flex items-center justify-center text-muted-foreground">
        Loading occupancy…
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
      {/* Date Range Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="dateRange" className="text-sm font-medium text-gray-700">
            Date Range:
          </label>
          <select
            id="dateRange"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="next7days">Next 7 Days</option>
            <option value="next14days">Next 14 Days</option>
            <option value="next30days">Next 30 Days</option>
            <option value="next90days">Next 90 Days</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>
        
        {dateRange === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Start date"
              min={new Date().toISOString().split('T')[0]} // Prevent past dates
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="End date"
              min={customStartDate || new Date().toISOString().split('T')[0]} // End date must be after start date
            />
            {(customStartDate && customEndDate && new Date(customStartDate) > new Date(customEndDate)) && (
              <span className="text-red-500 text-xs">End date must be after start date</span>
            )}
          </div>
        )}
        
        <div className="text-sm text-gray-600">
          Showing: {format(new Date(from), 'MMM d')} - {format(new Date(to), 'MMM d, yyyy')}
        </div>
      </div>

      {/* Chart */}
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
            labelFormatter={(d) => format(new Date(d), "EEE d MMM")}
            formatter={(val: any, name) => {
              if (name === "capacity") return [String(val), "Capacity"];
              if (name === "total") return [String(val), "Total occupied"];
              return [String(val), `Channel: ${name}`];
            }}
          />
          <Legend />

          {channelKeys.map((ck) => {
            // Get the original supplier name from the map, or fallback to formatted key
            const displayName = channelNameMap.get(ck) || ck.replace(/_/g, " ");
            return (
              <Bar
                key={ck}
                dataKey={ck}
                stackId="occ"
                fill={colorFor(ck)}
                name={displayName}
                maxBarSize={28}
              />
            );
          })}

          {/* Optional capacity reference line */}
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

      {/* Date Range Modal */}
      <DateRangeModal
        isOpen={isOpen}
        onClose={closeModal}
        onDateRangeChange={handleDateRangeChange}
        title="Select Date Range for Demand Curve"
      />
    </div>
  );
}