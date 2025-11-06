"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/hooks/useTenant";
import { cn } from "@/lib/utils";
import { Loader2, RefreshCw, AlertTriangle, Clock, Shield, Camera } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Exemption = {
  tenant_id: string;
  exemption_type: "OVERSTAY" | "NO_SHOW" | "UNAUTHORIZED_ENTRY" | "ANPR_FAILURE";
  vehicle_reg: string | null;
  booking_id: string | null;
  source_event_id: string | null;
  breach_point: string; // ISO
  overdue_by: string | null;
};

const TYPE_META: Record<
  Exemption["exemption_type"],
  { label: string; badgeClass: string; icon: React.ReactNode }
> = {
  OVERSTAY: {
    label: "Overstayed",
    badgeClass: "bg-rose-100 text-rose-700 border-rose-200",
    icon: <Clock className="h-3 w-3" />,
  },
  NO_SHOW: {
    label: "No-show",
    badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  UNAUTHORIZED_ENTRY: {
    label: "Unauthorized Entry",
    badgeClass: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
    icon: <Shield className="h-3 w-3" />,
  },
  ANPR_FAILURE: {
    label: "ANPR Failure",
    badgeClass: "bg-slate-200 text-slate-800 border-slate-300",
    icon: <Camera className="h-3 w-3" />,
  },
};

export default function ExemptionsPanel() {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [items, setItems] = useState<Exemption[]>([]);
  const [filter, setFilter] = useState<Exemption["exemption_type"] | "ALL">("ALL");
  const [isLoading, setLoading] = useState(false);

  async function load() {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/exemptions?tenantId=${tenantId}&limit=200`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (json.error) {
        toast({
          title: "Error",
          description: json.error,
          variant: "destructive",
        });
        return;
      }
      setItems(json.items ?? []);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to load exemptions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tenantId) {
      load();
      const t = setInterval(load, 15000); // poll every 15 seconds
      return () => clearInterval(t);
    }
  }, [tenantId]);

  const filtered = useMemo(() => {
    return filter === "ALL" ? items : items.filter((i) => i.exemption_type === filter);
  }, [items, filter]);

  const counts = useMemo(() => {
    const counts: Record<string, number> = { ALL: items.length };
    items.forEach((item) => {
      counts[item.exemption_type] = (counts[item.exemption_type] || 0) + 1;
    });
    return counts;
  }, [items]);

  function humanizeDuration(pgIntervalISO: string | null) {
    if (!pgIntervalISO) return "";
    // pg interval string like "01:23:00" or ISO duration
    try {
      const parts = pgIntervalISO.split(":");
      if (parts.length >= 2) {
        const hours = parseInt(parts[0]) || 0;
        const minutes = parseInt(parts[1]) || 0;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
      }
      return pgIntervalISO;
    } catch {
      return pgIntervalISO;
    }
  }

  async function openBooking(id: string) {
    window.location.href = `/admin/bookings/${id}`;
  }

  async function resolveExemption(item: Exemption) {
    try {
      const res = await fetch("/api/exemptions/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: item.tenant_id,
          exemptionType: item.exemption_type,
          bookingId: item.booking_id,
          sourceEventId: item.source_event_id,
        }),
      });

      const json = await res.json();
      if (json.error) {
        toast({
          title: "Error",
          description: json.error,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: "Exemption marked as resolved",
      });
      load(); // Refresh
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to resolve exemption",
        variant: "destructive",
      });
    }
  }

  async function triggerBarrierClose(item: Exemption) {
    try {
      const res = await fetch("/api/gate/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: item.tenant_id }),
      });

      const json = await res.json();
      if (json.error) {
        toast({
          title: "Error",
          description: json.error || "Failed to close gate",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: "Gate close command sent",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to close gate",
        variant: "destructive",
      });
    }
  }

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
    <Card className="shadow-sm border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Exemptions</CardTitle>
          <div className="flex gap-2 flex-wrap">
            {(["ALL", "OVERSTAY", "NO_SHOW", "UNAUTHORIZED_ENTRY", "ANPR_FAILURE"] as const).map(
              (f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? "default" : "outline"}
                  onClick={() => setFilter(f as any)}
                >
                  {f === "ALL" ? "All" : TYPE_META[f as Exemption["exemption_type"]].label}
                  {counts[f] > 0 && (
                    <Badge className="ml-2 bg-white/20 text-white">
                      {counts[f]}
                    </Badge>
                  )}
                </Button>
              )
            )}
            <Button size="sm" variant="outline" onClick={load} disabled={isLoading}>
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mt-4 grid gap-3">
          {filtered.length === 0 && !isLoading && (
            <div className="text-sm text-muted-foreground text-center py-8">
              Nothing needs attention 🎉
            </div>
          )}

          {isLoading && filtered.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}

          {filtered.map((item, idx) => {
            const meta = TYPE_META[item.exemption_type];
            return (
              <div
                key={idx}
                className="rounded-xl border p-4 flex items-start justify-between gap-4 hover:bg-gray-50 transition-colors"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      className={cn(
                        "px-2 py-0.5 rounded-full text-xs flex items-center gap-1",
                        meta.badgeClass
                      )}
                    >
                      {meta.icon}
                      {meta.label}
                    </Badge>
                    {item.vehicle_reg && (
                      <span className="font-mono text-sm font-semibold">
                        {item.vehicle_reg.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>
                      Breach: {new Date(item.breach_point).toLocaleString()}
                    </div>
                    {item.overdue_by && (
                      <div>Overdue {humanizeDuration(item.overdue_by)}</div>
                    )}
                    {item.booking_id && (
                      <div>Booking: {item.booking_id.slice(0, 8)}…</div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {item.booking_id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openBooking(item.booking_id!)}
                    >
                      View
                    </Button>
                  )}
                  <Button size="sm" onClick={() => resolveExemption(item)}>
                    Mark Resolved
                  </Button>
                  {item.exemption_type === "UNAUTHORIZED_ENTRY" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => triggerBarrierClose(item)}
                    >
                      Close Gate
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

