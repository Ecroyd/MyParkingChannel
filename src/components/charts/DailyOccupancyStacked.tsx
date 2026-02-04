'use client';

import * as React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { createBrowserClient } from '@supabase/ssr';
import { format, eachDayOfInterval } from 'date-fns';
import { getSourceLabel } from '@/lib/supplier/labels';

type Row = { day: string; channel: string; occupancy: number };

type Props = {
  tenantId?: string;  // Optional since we use RLS
  start: string;    // 'YYYY-MM-DD'
  end: string;      // 'YYYY-MM-DD' (exclusive)
  tz?: string;
  vehicle?: string | null;
};

type ChartRow = { day: string } & Record<string, number>;

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function DailyOccupancyStacked({ tenantId, start, end, tz = 'UTC', vehicle = null }: Props) {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [data, setData] = React.useState<ChartRow[]>([]);
  const [channels, setChannels] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch bookings - let RLS handle tenant isolation automatically
        const { data: allBookings, error: bookingsError } = await supabase
          .from('bookings')
          .select('start_at, end_at, source, external_source')
          .order('start_at', { ascending: true });

        if (bookingsError) {
          console.error("🔴 Supabase bookings fetch error:", bookingsError);
          throw new Error(`Database error: ${bookingsError.message}`);
        } else {
          console.log("✅ Supabase bookings fetch result:", allBookings?.length || 0, "bookings");
        }

        // Filter bookings that overlap with our date range
        const startDate = new Date(start);
        const endDate = new Date(end);
        const bookings = allBookings?.filter(booking => {
          const bookingStart = new Date(booking.start_at);
          const bookingEnd = new Date(booking.end_at);
          // Check if booking overlaps with our date range
          return bookingStart <= endDate && bookingEnd >= startDate;
        }) || [];

        if (cancelled) return;

        // Process bookings into daily occupancy data by channel
        const days = eachDayOfInterval({ start: new Date(start), end: new Date(end) });
        const dailyData: Row[] = [];


        for (const day of days) {
          const dayStr = format(day, 'yyyy-MM-dd');
          const channelCounts: Record<string, number> = {};

          // Count bookings that overlap with this day, grouped by channel
          for (const booking of bookings || []) {
            const startDate = new Date(booking.start_at);
            const endDate = new Date(booking.end_at);
            
            // Check if booking overlaps with this day
            if (startDate <= day && endDate >= day) {
              // Group by source only (never external_source)
              const sourceKey = (booking.source ?? "other").toLowerCase();
              channelCounts[sourceKey] = (channelCounts[sourceKey] || 0) + 1;
            }
          }

          // Always add a row for each day, even if no bookings
          // This ensures all days appear in the chart
          if (Object.keys(channelCounts).length === 0) {
            // No bookings on this day, add empty row
            dailyData.push({
              day: dayStr,
              channel: 'direct',
              occupancy: 0
            });
          } else {
            // Add data for each channel that has bookings on this day
            for (const [channel, count] of Object.entries(channelCounts)) {
              dailyData.push({
                day: dayStr,
                channel,
                occupancy: count
              });
            }
          }
        }

        setRows(dailyData);

        // pivot rows -> [{day, channel1, channel2, ...}]
        const byDay = new Map<string, Record<string, number>>();
        const chSet = new Set<string>();

        dailyData.forEach(r => {
          chSet.add(r.channel);
          if (!byDay.has(r.day)) byDay.set(r.day, {});
          const rec = byDay.get(r.day)!;
          rec[r.channel] = (rec[r.channel] ?? 0) + r.occupancy;
        });

        const pivot: any[] = Array.from(byDay.entries())
          .sort(([a],[b]) => a.localeCompare(b))
          .map(([day, rec]) => ({ day, ...rec }));

        setChannels(Array.from(chSet).sort());
        setData(pivot);
      } catch (e:any) {
        if (!cancelled) setError(e.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tenantId, start, end, tz, vehicle]);

  if (loading) return <div className="text-sm text-muted-foreground">Loading daily occupancy…</div>;
  if (error)   return <div className="text-sm text-red-600">Analytics error: {error}</div>;
  if (!data.length) return <div className="text-sm text-muted-foreground">No data in range.</div>;

  // Define colors for different channels
  const channelColors: Record<string, string> = {
    'direct': '#3b82f6',
    'booking.com': '#003580',
    'expedia': '#ff5a5f',
    'airbnb': '#ff5a5f',
    'parkvia': '#10b981',
    'holidayextras': '#f59e0b',
    'other': '#6b7280'
  };

  return (
    <div className="w-full h-[360px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} stackOffset="none" margin={{ top: 16, right: 16, left: 16, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis 
            dataKey="day" 
            tickFormatter={(value) => format(new Date(value), 'dd MMM')}
            minTickGap={Math.max(1, Math.floor(data.length / 10))}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis allowDecimals={false} />
          <Tooltip 
            labelFormatter={(value) => format(new Date(value), 'EEE d MMM yyyy')}
            formatter={(value: any, name: string) => [value, name]}
          />
          <Legend />
          {channels.map((ch) => (
            <Bar 
              key={ch} 
              dataKey={ch} 
              stackId="a" 
              fill={channelColors[ch] || '#6b7280'}
              name={getSourceLabel(ch)}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
