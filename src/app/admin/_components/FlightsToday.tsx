"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTenant } from "@/hooks/useTenant";
import { Loader2 } from "lucide-react";

type Row = {
  flight_number: string;
  flight_date: string;
  airline_iata: string | null;
  dep_airport_iata: string | null;
  arr_airport_iata: string | null;
  scheduled_departure: string | null;
  scheduled_arrival: string | null;
  estimated_departure: string | null;
  estimated_arrival: string | null;
  status: string | null;
  arrivals_count: number;
  departures_count: number;
};

export default function FlightsToday() {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tenantId) {
      loadFlights();
      // Refresh every 5 minutes
      const interval = setInterval(loadFlights, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [tenantId]);

  async function loadFlights() {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/flights/today?tenantId=${tenantId}&tz=Europe/London`
      );
      const json = await res.json();
      if (json.error) {
        console.error("Error loading flights:", json.error);
        setRows([]);
      } else {
        setRows(json.data || []);
      }
    } catch (err) {
      console.error("Failed to load flights:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  const arrivals = useMemo(
    () =>
      rows
        .filter((r) => (r.arrivals_count ?? 0) > 0)
        .sort(sortByTime("estimated_arrival", "scheduled_arrival")),
    [rows]
  );

  const departures = useMemo(
    () =>
      rows
        .filter((r) => (r.departures_count ?? 0) > 0)
        .sort(sortByTime("estimated_departure", "scheduled_departure")),
    [rows]
  );

  if (tenantLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <FlightCard title="Arrivals Today" subtitle="Booked passengers per flight">
        {loading ? (
          <Skeleton />
        ) : (
          <FlightList rows={arrivals} mode="arrival" />
        )}
      </FlightCard>
      <FlightCard
        title="Departures Today"
        subtitle="Booked passengers per flight"
      >
        {loading ? (
          <Skeleton />
        ) : (
          <FlightList rows={departures} mode="departure" />
        )}
      </FlightCard>
    </div>
  );
}

function sortByTime(primary: keyof Row, fallback: keyof Row) {
  return (a: Row, b: Row) => {
    const ax = a[primary] ?? a[fallback];
    const bx = b[primary] ?? b[fallback];
    const ta = ax && typeof ax === 'string' ? Date.parse(ax) : 0;
    const tb = bx && typeof bx === 'string' ? Date.parse(bx) : 0;
    return ta - tb;
  };
}

function FlightList({
  rows,
  mode,
}: {
  rows: Row[];
  mode: "arrival" | "departure";
}) {
  if (!rows.length) {
    return (
      <div className="text-sm text-gray-500">
        No {mode}s with bookings yet.
      </div>
    );
  }

  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <li
          key={`${r.flight_number}-${r.flight_date}`}
          className="py-3 flex items-center justify-between"
        >
          <div>
            <div className="font-medium">
              {r.flight_number}{" "}
              <span className="text-xs text-gray-500">
                {r.airline_iata ?? ""}
              </span>
            </div>
            <div className="text-xs text-gray-500">
              {mode === "arrival"
                ? `${r.dep_airport_iata ?? "??"} → ${r.arr_airport_iata ?? "??"}`
                : `${r.dep_airport_iata ?? "??"} → ${r.arr_airport_iata ?? "??"}`}
            </div>
            <div className="text-xs">
              {mode === "arrival"
                ? timeLabel(r.estimated_arrival, r.scheduled_arrival)
                : timeLabel(r.estimated_departure, r.scheduled_departure)}
              {r.status ? ` • ${r.status}` : ""}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold">
              {mode === "arrival" ? r.arrivals_count : r.departures_count}
            </div>
            <div className="text-xs text-gray-500">booked</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function timeLabel(estimated: string | null, scheduled: string | null) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (estimated && scheduled && estimated !== scheduled) {
    return `ETA ${fmt(estimated)} (sched ${fmt(scheduled)})`;
  }
  if (estimated) return `ETA ${fmt(estimated)}`;
  if (scheduled) return `Sched ${fmt(scheduled)}`;
  return "Time TBD";
}

function FlightCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        {subtitle && (
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse h-16 bg-gray-100 rounded" />
      ))}
    </div>
  );
}

