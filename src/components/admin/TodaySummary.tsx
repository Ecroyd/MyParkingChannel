'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, Car, Clock, CheckCircle } from 'lucide-react'

interface TodaySummaryProps {
  tenantSlug: string
}

interface SummaryData {
  arrivals: number
  departures: number
  checkedIn: number
  capacityRemaining: number
  totalCapacity: number
}

export function TodaySummary({ tenantSlug }: TodaySummaryProps) {
  const [summary, setSummary] = useState<SummaryData>({
    arrivals: 0,
    departures: 0,
    checkedIn: 0,
    capacityRemaining: 0,
    totalCapacity: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchSummary() {
      try {
        const response = await fetch('/api/admin/today/summary', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tenant: tenantSlug })
        })

        if (response.ok) {
          const data = await response.json()
          setSummary(data)
        }
      } catch (error) {
        console.error('Failed to fetch summary:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSummary()
  }, [tenantSlug])

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Loading...</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">-</div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const occupancyRate = summary.totalCapacity > 0 
    ? Math.round(((summary.totalCapacity - summary.capacityRemaining) / summary.totalCapacity) * 100)
    : 0

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Arrivals Today</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{summary.arrivals}</div>
          <p className="text-xs text-muted-foreground">
            Bookings starting today
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Departures Today</CardTitle>
          <Car className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{summary.departures}</div>
          <p className="text-xs text-muted-foreground">
            Bookings ending today
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Currently Checked In</CardTitle>
          <CheckCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{summary.checkedIn}</div>
          <p className="text-xs text-muted-foreground">
            Active parking sessions
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Capacity</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{summary.capacityRemaining}</div>
          <p className="text-xs text-muted-foreground">
            {summary.totalCapacity} total ({occupancyRate}% occupied)
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

