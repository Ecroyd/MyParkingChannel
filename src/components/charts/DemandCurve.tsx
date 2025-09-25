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

type Booking = {
  start_at: string;  // timestamptz
  end_at: string;    // timestamptz
  source: string | null; // channel
  tenant_id?: string;
};

type DayRow = {
  date: string;          // yyyy-MM-dd
  capacity: number;      // capacity for this day
  total: number;         // total occupied cars
  // dynamic channel keys -> counts
  [channelKey: string]: number | string;
};


/** Stable, readable keys for recharts from any source string */
function keyFromSource(src: string) {
  return src.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
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
  capacity = 100, // default; replace via prop or wire to your settings table later
  showCapacityLine = true,
}: {
  tenantId: string;
  capacity?: number;
  showCapacityLine?: boolean;
}) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('next14days');
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
        result = { from: customStartDate, to: customEndDate };
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

  // 2) Build day list
  const days = useMemo(() => {
    const start = new Date(from);
    const end = new Date(to);
    return eachDayOfInterval({ start, end });
  }, [from, to]);

  // 3) Aggregate per day per channel
  const { data, channelKeys, maxY } = useMemo(() => {
    const rows: DayRow[] = [];
    const chSet = new Set<string>();

    for (const day of days) {
      const dayStr = format(day, "yyyy-MM-dd");
      const row: DayRow = { date: dayStr, capacity, total: 0 };

      for (const b of bookings) {
        const s = new Date(b.start_at);
        const e = new Date(b.end_at);

        // booking counts on this day if it overlaps [00:00..23:59] of that day
        if (s <= day && e >= day) {
          const name = keyFromSource((b.source ?? "unknown").trim() || "unknown");
          chSet.add(name);
          row[name] = (row[name] as number | undefined ?? 0) + 1;
          row.total += 1;
        }
      }

      rows.push(row);
    }

    let m = 0;
    for (const r of rows) m = Math.max(m, r.total, r.capacity as number);

    return { data: rows, channelKeys: Array.from(chSet).sort(), maxY: Math.max(5, m) };
  }, [bookings, days, capacity]);

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
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="End date"
            />
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

          {channelKeys.map((ck) => (
            <Bar
              key={ck}
              dataKey={ck}
              stackId="occ"
              fill={colorFor(ck)}
              name={ck.replace(/_/g, " ")}
              maxBarSize={28}
            />
          ))}

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
    </div>
  );
}