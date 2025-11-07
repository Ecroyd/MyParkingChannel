"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useTenant } from "@/hooks/useTenant";
import { Loader2, Search, Plane, X } from "lucide-react";

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

type FlightDetails = {
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
};

export default function FlightsToday() {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [scannerFlightNumber, setScannerFlightNumber] = useState("");
  const [scannerFlightDate, setScannerFlightDate] = useState("");
  const [scanning, setScanning] = useState(false);
  const [flightDetails, setFlightDetails] = useState<FlightDetails | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanSource, setScanSource] = useState<string | null>(null);

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

  async function handleFlightLookup() {
    if (!tenantId || !scannerFlightNumber.trim()) {
      setScanError("Flight number is required");
      return;
    }

    setScanning(true);
    setScanError(null);
    setFlightDetails(null);
    setScanSource(null);

    try {
      const res = await fetch("/api/flights/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          flightNumber: scannerFlightNumber.trim().toUpperCase(),
          flightDate: scannerFlightDate || undefined,
        }),
      });

      const json = await res.json();

      if (json.error) {
        setScanError(json.error);
        setFlightDetails(null);
        setScanSource(null);
      } else if (json.flight) {
        setFlightDetails(json.flight);
        setScanSource(json.source || null);
        setScanError(null);
        // Refresh the flights list to include the newly looked up flight
        loadFlights();
      } else {
        setScanError("Flight not found");
        setFlightDetails(null);
        setScanSource(null);
      }
    } catch (err: any) {
      setScanError(err.message || "Failed to lookup flight");
      setFlightDetails(null);
    } finally {
      setScanning(false);
    }
  }

  function clearScanner() {
    setScannerFlightNumber("");
    setScannerFlightDate("");
    setFlightDetails(null);
    setScanError(null);
    setScanSource(null);
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
    <div className="space-y-6">
      {/* Flight Number Scanner */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plane className="h-5 w-5" />
            Flight Number Scanner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="scanner-flight-number">Flight Number</Label>
              <Input
                id="scanner-flight-number"
                value={scannerFlightNumber}
                onChange={(e) => setScannerFlightNumber(e.target.value.toUpperCase())}
                placeholder="e.g. BA123"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !scanning) {
                    handleFlightLookup();
                  }
                }}
                disabled={scanning}
                className="uppercase"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scanner-flight-date">Flight Date (optional)</Label>
              <Input
                id="scanner-flight-date"
                type="date"
                value={scannerFlightDate}
                onChange={(e) => setScannerFlightDate(e.target.value)}
                disabled={scanning}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button
                onClick={handleFlightLookup}
                disabled={scanning || !scannerFlightNumber.trim() || !tenantId}
                className="flex-1"
              >
                {scanning ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Looking up...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Lookup Flight
                  </>
                )}
              </Button>
              {(scannerFlightNumber || scannerFlightDate || flightDetails) && (
                <Button
                  variant="outline"
                  onClick={clearScanner}
                  disabled={scanning}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {scanError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
              {scanError}
            </div>
          )}

          {flightDetails && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-md">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-green-900">Flight Details</h3>
                {scanSource && (
                  <span className="text-xs text-green-600 capitalize">
                    Source: {scanSource}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-gray-600">Flight</div>
                  <div className="font-medium">
                    {flightDetails.flight_number}
                    {flightDetails.airline_iata && (
                      <span className="text-gray-500 ml-1">
                        ({flightDetails.airline_iata})
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-gray-600">Date</div>
                  <div className="font-medium">{flightDetails.flight_date}</div>
                </div>
                <div>
                  <div className="text-gray-600">Route</div>
                  <div className="font-medium">
                    {flightDetails.dep_airport_iata ?? "??"} →{" "}
                    {flightDetails.arr_airport_iata ?? "??"}
                  </div>
                </div>
                <div>
                  <div className="text-gray-600">Status</div>
                  <div className="font-medium">
                    {flightDetails.status || "N/A"}
                  </div>
                </div>
                {flightDetails.scheduled_departure && (
                  <div>
                    <div className="text-gray-600">Scheduled Departure</div>
                    <div className="font-medium">
                      {new Date(
                        flightDetails.scheduled_departure
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                )}
                {flightDetails.estimated_departure && (
                  <div>
                    <div className="text-gray-600">Estimated Departure</div>
                    <div className="font-medium">
                      {new Date(
                        flightDetails.estimated_departure
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                )}
                {flightDetails.scheduled_arrival && (
                  <div>
                    <div className="text-gray-600">Scheduled Arrival</div>
                    <div className="font-medium">
                      {new Date(
                        flightDetails.scheduled_arrival
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                )}
                {flightDetails.estimated_arrival && (
                  <div>
                    <div className="text-gray-600">Estimated Arrival</div>
                    <div className="font-medium">
                      {new Date(
                        flightDetails.estimated_arrival
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Flights Today Lists */}
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

