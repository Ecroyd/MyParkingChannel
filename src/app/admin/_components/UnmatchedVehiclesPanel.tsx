"use client";

// Dashboard card: cars the ANPR cameras saw that matched no booking and aren't staff. Each row can
// be looked up in bookings (wrong plate on the booking), saved as a staff vehicle, or dismissed
// (wrong car park etc. — it shows again if the car comes back). Hidden at sites with no camera
// reads in the last week.

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTenant } from "@/hooks/useTenant";
import { toast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Search, UserCheck, ArrowDownLeft, ArrowUpRight, X } from "lucide-react";
import type { UnmatchedVehicle } from "@/lib/anpr/unmatchedVehicles";

const POLL_MS = 120_000;
type Range = "today" | "7d";

function formatTime(iso: string, range: Range): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  if (range === "today") return time;
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });
  return `${day} ${time}`;
}

export default function UnmatchedVehiclesPanel() {
  const { tenantId } = useTenant();
  const [range, setRange] = useState<Range>("today");
  const [vehicles, setVehicles] = useState<UnmatchedVehicle[]>([]);
  const [hasAnpr, setHasAnpr] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staffFor, setStaffFor] = useState<string | null>(null);
  const [staffName, setStaffName] = useState("");
  const [saving, setSaving] = useState(false);
  const [dismissing, setDismissing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/anpr/unmatched?tenantId=${encodeURIComponent(tenantId)}&range=${range}`, {
        cache: "no-store",
      });
      if (res.status === 403) {
        setHasAnpr(false); // role without gate access: keep the card hidden
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setVehicles(data.vehicles ?? []);
      setHasAnpr(Boolean(data.hasAnpr));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [tenantId, range]);

  useEffect(() => {
    void load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const saveStaff = async (plate: string) => {
    if (!tenantId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/staff-vehicles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId, plate, description: staffName.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save");
      toast({ title: `${plate} saved as a staff vehicle`, description: "Its reads won't show here any more." });
      setStaffFor(null);
      setStaffName("");
      setVehicles((v) => v.filter((x) => x.plate !== plate));
    } catch (err) {
      toast({
        title: "Couldn't save staff vehicle",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const dismiss = async (plate: string) => {
    if (!tenantId) return;
    setDismissing(plate);
    try {
      const res = await fetch("/api/admin/anpr/unmatched", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId, plate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not dismiss");
      setVehicles((v) => v.filter((x) => x.plate !== plate));
      if (staffFor === plate) setStaffFor(null);
      toast({ title: `${plate} dismissed`, description: "It will show again if the car comes back." });
    } catch (err) {
      toast({
        title: "Couldn't dismiss",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setDismissing(null);
    }
  };

  if (hasAnpr === false) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Cars without a booking</CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Seen by the cameras but not matched to a booking or a staff vehicle.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-gray-200 p-0.5 text-sm">
              {(["today", "7d"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={`px-3 py-1 rounded ${range === r ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}
                >
                  {r === "today" ? "Today" : "Last 7 days"}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading} aria-label="Refresh">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
        {hasAnpr === null && loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : vehicles.length === 0 ? (
          <p className="text-sm text-gray-500">
            {range === "today" ? "Every car seen today matched a booking or a staff vehicle." : "Every car seen in the last 7 days matched a booking or a staff vehicle."}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {vehicles.map((v) => (
              <li key={v.plate} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold tracking-wide bg-yellow-100 border border-yellow-300 rounded px-2 py-0.5 text-gray-900">
                        {v.plate}
                      </span>
                      {(v.colour || v.make) && (
                        <span className="text-sm text-gray-600 truncate">{[v.colour, v.make].filter(Boolean).join(" ")}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                      {v.lastDirection === "in" ? (
                        <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" />
                      ) : v.lastDirection === "out" ? (
                        <ArrowUpRight className="h-3.5 w-3.5 text-blue-600" />
                      ) : null}
                      {v.lastDirection === "in" ? "Came in" : v.lastDirection === "out" ? "Went out" : "Seen"} at{" "}
                      {formatTime(v.lastSeen, range)}
                      {v.reads > 1 && (
                        <span className="text-gray-400">
                          {" "}
                          · seen {v.reads} times ({v.ins} in, {v.outs} out)
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/bookings-server?search=${encodeURIComponent(v.plate)}`}>
                        <Search className="h-4 w-4 mr-1" />
                        Find booking
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setStaffFor(staffFor === v.plate ? null : v.plate);
                        setStaffName("");
                      }}
                    >
                      <UserCheck className="h-4 w-4 mr-1" />
                      Staff car
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void dismiss(v.plate)}
                      disabled={dismissing === v.plate}
                      aria-label={`Dismiss ${v.plate}`}
                      title="Dismiss (wrong car park, delivery, visitor). Shows again if the car comes back."
                    >
                      {dismissing === v.plate ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4 mr-1" />}
                      Dismiss
                    </Button>
                  </div>
                </div>
                {staffFor === v.plate && (
                  <form
                    className="mt-3 flex flex-wrap items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveStaff(v.plate);
                    }}
                  >
                    <Input
                      autoFocus
                      value={staffName}
                      onChange={(e) => setStaffName(e.target.value)}
                      placeholder="Whose car? (optional)"
                      className="h-8 w-56"
                    />
                    <Button type="submit" size="sm" disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save as staff"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setStaffFor(null)}>
                      Cancel
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
