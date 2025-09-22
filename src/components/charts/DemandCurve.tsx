"use client";
import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { format, eachDayOfInterval } from "date-fns";
import { createBrowserClient } from '@supabase/ssr';

type Row = { date: string; cars: number; capacity: number; channel: string };

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function DemandCurve({
  tenantId, from, to
}: { tenantId: string; from: string; to: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // For localhost development, fetch bookings directly from Supabase
        const { data: bookings, error } = await supabase
          .from('bookings')
          .select('start_at, end_at, source')
          .gte('start_at', from)
          .lte('end_at', to)
          .order('start_at', { ascending: true });

        if (error) {
          console.error('Error fetching bookings:', error);
          setRows([]);
          return;
        }

        // Process bookings into daily occupancy data
        const days = eachDayOfInterval({ start: new Date(from), end: new Date(to) });
        const dailyData: Row[] = [];

        for (const day of days) {
          const dayStr = format(day, 'yyyy-MM-dd');
          let carsOnDay = 0;

          // Count bookings that overlap with this day
          for (const booking of bookings || []) {
            const startDate = new Date(booking.start_at);
            const endDate = new Date(booking.end_at);
            
            // Check if booking overlaps with this day
            if (startDate <= day && endDate >= day) {
              carsOnDay++;
            }
          }

          dailyData.push({
            date: dayStr,
            cars: carsOnDay,
            capacity: 100, // Default capacity - you can make this configurable
            channel: 'all'
          });
        }

        setRows(dailyData);
      } catch (error) {
        console.error('Error processing bookings:', error);
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [tenantId, from, to]);

  const data = useMemo(() => {
    // Transform rows into chart data format
    return rows.map(row => ({
      date: row.date,
      in: row.cars,
      capacity: row.capacity
    }));
  }, [rows]);

  const maxY = useMemo(() => {
    let m = 0;
    for (const d of data) m = Math.max(m, d.in, d.capacity);
    return Math.max(5, m);
  }, [data]);

  if (loading) {
    return (
      <div className="w-full h-[320px] flex items-center justify-center">
        <div className="text-gray-500">Loading occupancy data...</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="w-full h-[320px] flex items-center justify-center">
        <div className="text-gray-500">No booking data available for the selected period</div>
      </div>
    );
  }

  return (
    <div className="w-full h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis 
            dataKey="date" 
            tickFormatter={(d) => format(new Date(d), 'dd MMM')} 
            minTickGap={24} 
          />
          <YAxis domain={[0, maxY]} />
          <Tooltip
            labelFormatter={(d) => format(new Date(d), 'EEE d MMM')}
            formatter={(val: any, name) => [String(val), name === 'in' ? 'Occupied (cars)' : 'Capacity']}
          />
          <Line 
            type="monotone" 
            dataKey="capacity" 
            stroke="#94a3b8" 
            strokeDasharray="4 4" 
            dot={false} 
            name="Capacity" 
          />
          <Line 
            type="monotone" 
            dataKey="in" 
            stroke="#3b82f6" 
            strokeWidth={2}
            dot={false} 
            name="Occupied (cars)" 
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

