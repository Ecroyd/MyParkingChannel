'use client'

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Legend
} from 'recharts'

type FinanceRow = { day: string; channel: string; bookings: number; money_received: number; money_charged: number }
type Props = { rows: FinanceRow[] }

export default function AnalyticsCharts({ rows }: Props) {
  // Demand curve (bookings per day, all channels)
  const byDay = Object.values(rows.reduce<Record<string, { day: string; bookings: number }>>((acc, r) => {
    const key = r.day
    if (!acc[key]) acc[key] = { day: r.day, bookings: 0 }
    acc[key].bookings += r.bookings
    return acc
  }, {})).sort((a,b)=>a.day.localeCompare(b.day))

  // Revenue by channel (sum over range)
  const byChannelMap = rows.reduce<Record<string, { channel: string; money_received: number; bookings: number }>>((acc, r) => {
    const k = r.channel
    if (!acc[k]) acc[k] = { channel: k, money_received: 0, bookings: 0 }
    acc[k].money_received += Number(r.money_received || 0)
    acc[k].bookings += r.bookings
    return acc
  }, {})
  const byChannel = Object.values(byChannelMap).sort((a,b)=>b.money_received - a.money_received)

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="rounded-xl border bg-white p-4">
        <div className="text-sm font-semibold mb-3">Demand curve (bookings per day)</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={byDay}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="bookings" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="text-sm font-semibold mb-3">Revenue by channel (selected range)</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byChannel}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="channel" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="money_received" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

