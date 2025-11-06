"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useTenant } from "@/hooks/useTenant";
import { cn } from "@/lib/utils";
import { Loader2, RefreshCw, AlertTriangle, Clock, Shield, Camera, CheckSquare, ChevronDown, ChevronUp, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { toMoney } from "@/lib/money";

type Exemption = {
  tenant_id: string;
  exemption_type: "OVERSTAY" | "NO_SHOW" | "UNAUTHORIZED_ENTRY" | "ANPR_FAILURE";
  vehicle_reg: string | null;
  booking_id: string | null;
  source_event_id: string | null;
  breach_point: string; // ISO
  overdue_by: string | null;
  // Add a unique key for tracking
  _key?: string;
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
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [selectedExemption, setSelectedExemption] = useState<Exemption | null>(null);
  const [loadingBooking, setLoadingBooking] = useState(false);

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
      const exemptions = (json.items ?? []) as Exemption[];
      // Add unique keys for tracking
      const itemsWithKeys = exemptions.map((item, idx) => {
        // Normalize timestamp to minute precision for consistent key generation
        const breachPoint = item.breach_point ? new Date(item.breach_point).toISOString().slice(0, 16) : 'none';
        return {
          ...item,
          _key: `${item.tenant_id}-${item.exemption_type}-${(item.vehicle_reg || '').toUpperCase()}-${item.booking_id || 'none'}-${item.source_event_id || 'none'}-${breachPoint}`,
        };
      });
      setItems(itemsWithKeys);
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

  async function openBooking(id: string, exemption: Exemption) {
    if (!id) return;
    
    setSelectedBookingId(id);
    setSelectedExemption(exemption);
    setLoadingBooking(true);
    
    try {
      const res = await fetch(`/api/bookings/${id}`);
      const json = await res.json();
      
      if (json.error) {
        toast({
          title: "Error",
          description: json.error || "Failed to load booking",
          variant: "destructive",
        });
        setSelectedBookingId(null);
        setSelectedExemption(null);
        return;
      }
      
      setSelectedBooking(json);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to load booking",
        variant: "destructive",
      });
      setSelectedBookingId(null);
      setSelectedExemption(null);
    } finally {
      setLoadingBooking(false);
    }
  }
  
  function closeBookingModal() {
    setSelectedBookingId(null);
    setSelectedBooking(null);
    setSelectedExemption(null);
  }
  
  function getExemptionExplanation(exemption: Exemption): string {
    switch (exemption.exemption_type) {
      case "OVERSTAY":
        return `This booking has overstayed. The vehicle was scheduled to leave by ${new Date(exemption.breach_point).toLocaleString()}, but has not been checked out.${exemption.overdue_by ? ` It has been overdue for ${humanizeDuration(exemption.overdue_by)}.` : ""}`;
      case "NO_SHOW":
        return `This booking is a no-show. The vehicle was scheduled to arrive by ${new Date(exemption.breach_point).toLocaleString()}, but has not been checked in.${exemption.overdue_by ? ` It has been overdue for ${humanizeDuration(exemption.overdue_by)}.` : ""}`;
      case "UNAUTHORIZED_ENTRY":
        return `An unauthorized entry was detected. A gate entry event occurred at ${new Date(exemption.breach_point).toLocaleString()} for vehicle ${exemption.vehicle_reg || "unknown"}, but no valid booking was found for this vehicle at that time.`;
      case "ANPR_FAILURE":
        return `An ANPR (Automatic Number Plate Recognition) failure occurred at ${new Date(exemption.breach_point).toLocaleString()}. This could be due to a camera error, low confidence plate recognition, plate mismatch, or missing plate data.`;
      default:
        return "Exemption details not available.";
    }
  }

  async function resolveExemption(item: Exemption) {
    await resolveExemptions([item]);
  }

  async function resolveExemptions(exemptionsToResolve: Exemption[]) {
    if (exemptionsToResolve.length === 0) return;
    
    setResolving(true);
    try {
      const res = await fetch("/api/exemptions/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exemptions: exemptionsToResolve.map((item) => ({
            tenantId: item.tenant_id,
            exemptionType: item.exemption_type,
            bookingId: item.booking_id,
            sourceEventId: item.source_event_id,
            vehicleReg: item.vehicle_reg,
            breachPoint: item.breach_point,
          })),
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
        description: `${exemptionsToResolve.length} exemption(s) marked as resolved`,
      });
      
      // Clear selection
      setSelectedItems(new Set());
      
      // Refresh
      await load();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to resolve exemptions",
        variant: "destructive",
      });
    } finally {
      setResolving(false);
    }
  }

  function toggleSelection(key: string) {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedItems(newSelected);
  }

  function toggleSelectAll() {
    if (selectedItems.size === filtered.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filtered.map((item) => item._key || '').filter(Boolean)));
    }
  }

  async function handleBulkResolve() {
    const selected = filtered.filter((item) => item._key && selectedItems.has(item._key));
    if (selected.length === 0) {
      toast({
        title: "No selection",
        description: "Please select exemptions to resolve",
        variant: "destructive",
      });
      return;
    }
    await resolveExemptions(selected);
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
    <>
      <Card className="shadow-sm border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg font-semibold">Exemptions</CardTitle>
              {items.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {items.length}
                </Badge>
              )}
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsMinimized(!isMinimized)}
                className="h-8 w-8 p-0"
              >
                {isMinimized ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </Button>
            {selectedItems.size > 0 && (
              <Button
                size="sm"
                variant="default"
                onClick={handleBulkResolve}
                disabled={resolving}
              >
                {resolving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resolving...
                  </>
                ) : (
                  <>
                    <CheckSquare className="mr-2 h-4 w-4" />
                    Resolve Selected ({selectedItems.size})
                  </>
                )}
              </Button>
            )}
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
        {!isMinimized && (
          <CardContent>
        {filtered.length > 0 && (
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedItems.size === filtered.length && filtered.length > 0}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-sm text-muted-foreground">
                Select all ({selectedItems.size} selected)
              </span>
            </div>
          </div>
        )}
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
            const isSelected = item._key ? selectedItems.has(item._key) : false;
            return (
              <div
                key={item._key || idx}
                className={cn(
                  "rounded-xl border p-4 flex items-start justify-between gap-4 hover:bg-gray-50 transition-colors",
                  isSelected && "bg-blue-50 border-blue-200"
                )}
              >
                <div className="flex items-start gap-3 flex-1">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => item._key && toggleSelection(item._key)}
                    className="mt-1"
                  />
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
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {item.booking_id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openBooking(item.booking_id!, item)}
                      disabled={loadingBooking}
                    >
                      {loadingBooking && selectedBookingId === item.booking_id ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        "View"
                      )}
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
        )}
      </Card>

      {/* Booking Details Modal with Exemption Context */}
      {selectedBookingId && selectedBooking && (
        <BookingDetailsModalWithExemption
          booking={selectedBooking}
          exemption={selectedExemption}
          open={!!selectedBookingId}
          onClose={closeBookingModal}
          onBookingUpdated={() => {
            load();
            closeBookingModal();
          }}
        />
      )}
    </>
  );
}

// Enhanced Booking Modal with Exemption Context
function BookingDetailsModalWithExemption({
  booking,
  exemption,
  open,
  onClose,
  onBookingUpdated,
}: {
  booking: any;
  exemption: Exemption | null;
  open: boolean;
  onClose: () => void;
  onBookingUpdated?: () => void;
}) {
  const [tab, setTab] = useState<'overview'|'edit'|'extend'|'refund'>('overview');
  const [loading, setLoading] = useState(false);

  function getExemptionExplanation(exemption: Exemption | null): string {
    if (!exemption) return "";
    
    switch (exemption.exemption_type) {
      case "OVERSTAY":
        const overdue = exemption.overdue_by ? humanizeDuration(exemption.overdue_by) : "";
        return `This booking has overstayed. The vehicle was scheduled to leave by ${new Date(exemption.breach_point).toLocaleString()}, but has not been checked out.${overdue ? ` It has been overdue for ${overdue}.` : ""}`;
      case "NO_SHOW":
        const overdueNoShow = exemption.overdue_by ? humanizeDuration(exemption.overdue_by) : "";
        return `This booking is a no-show. The vehicle was scheduled to arrive by ${new Date(exemption.breach_point).toLocaleString()}, but has not been checked in.${overdueNoShow ? ` It has been overdue for ${overdueNoShow}.` : ""}`;
      case "UNAUTHORIZED_ENTRY":
        return `An unauthorized entry was detected. A gate entry event occurred at ${new Date(exemption.breach_point).toLocaleString()} for vehicle ${exemption.vehicle_reg || "unknown"}, but no valid booking was found for this vehicle at that time.`;
      case "ANPR_FAILURE":
        return `An ANPR (Automatic Number Plate Recognition) failure occurred at ${new Date(exemption.breach_point).toLocaleString()}. This could be due to a camera error, low confidence plate recognition, plate mismatch, or missing plate data.`;
      default:
        return "Exemption details not available.";
    }
  }

  function humanizeDuration(pgIntervalISO: string | null) {
    if (!pgIntervalISO) return "";
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

  if (!open) return null;

  const meta = exemption ? TYPE_META[exemption.exemption_type] : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Booking {booking?.reference}</h2>
            {booking?.is_incomplete && (
              <span className="inline-flex px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
                Incomplete ({booking.missing_fields?.join(', ')})
              </span>
            )}
            {exemption && meta && (
              <Badge className={cn("px-2 py-0.5 rounded-full text-xs flex items-center gap-1", meta.badgeClass)}>
                {meta.icon}
                {meta.label}
              </Badge>
            )}
          </div>
          <button className="text-sm hover:text-gray-600" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Exemption Explanation Banner */}
        {exemption && (
          <div className={cn(
            "p-4 border-b",
            exemption.exemption_type === "OVERSTAY" && "bg-rose-50 border-rose-200",
            exemption.exemption_type === "NO_SHOW" && "bg-amber-50 border-amber-200",
            exemption.exemption_type === "UNAUTHORIZED_ENTRY" && "bg-fuchsia-50 border-fuchsia-200",
            exemption.exemption_type === "ANPR_FAILURE" && "bg-slate-50 border-slate-200"
          )}>
            <div className="flex items-start gap-2">
              {meta?.icon && <div className="mt-0.5">{meta.icon}</div>}
              <div className="flex-1">
                <div className="font-semibold text-sm mb-1">{meta?.label} Detected</div>
                <div className="text-xs text-gray-700">{getExemptionExplanation(exemption)}</div>
                <div className="text-xs text-gray-500 mt-1">
                  Breach point: {new Date(exemption.breach_point).toLocaleString()}
                  {exemption.overdue_by && ` • Overdue: ${humanizeDuration(exemption.overdue_by)}`}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="px-4 pt-2">
          <div className="flex gap-3 border-b">
            {['overview','edit','extend','refund'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t as any)}
                className={`py-2 ${tab===t ? 'border-b-2 border-black font-medium' : 'text-gray-500'}`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4">
          {loading && <p>Loading…</p>}

          {!loading && booking && tab === 'overview' && (
            <div className="grid grid-cols-2 gap-4">
              <Info label="Customer" value={booking.customer_name} />
              <Info label="Email" value={booking.customer_email} />
              <Info label="Phone" value={booking.customer_phone || '—'} />
              <Info label="Plate" value={booking.plate} />
              <Info label="Make" value={booking.car_make || '—'} />
              <Info label="Model" value={booking.car_model || '—'} />
              <Info label="Colour" value={booking.car_color || '—'} />
              <Info label="Start" value={new Date(booking.start_at).toLocaleString()} />
              <Info label="End" value={new Date(booking.end_at).toLocaleString()} />
              <Info label="Charged" value={toMoney(Math.round((booking.money_charged ?? 0) * 100))} />
              <Info label="Flight" value={booking.flight_number || '—'} />
              <Info label="Status" value={booking.status || '—'} />
              <Info label="Checked In" value={booking.checked_in_at ? new Date(booking.checked_in_at).toLocaleString() : '—'} />
              <Info label="Checked Out" value={booking.checked_out_at ? new Date(booking.checked_out_at).toLocaleString() : '—'} />
              <div className="col-span-2">
                <Info label="Notes" value={booking.notes || '—'} />
              </div>
            </div>
          )}

          {!loading && booking && tab === 'edit' && (
            <EditForm booking={booking} onSaved={async () => { setTab('overview'); if (onBookingUpdated) onBookingUpdated(); }} />
          )}

          {!loading && booking && tab === 'extend' && (
            <ExtendForm booking={booking} onExtended={async () => { setTab('overview'); if (onBookingUpdated) onBookingUpdated(); }} />
          )}

          {!loading && booking && tab === 'refund' && (
            <RefundForm booking={booking} onRefunded={async () => { setTab('overview'); if (onBookingUpdated) onBookingUpdated(); }} />
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function EditForm({ booking, onSaved }: { booking: any; onSaved: () => void }) {
  const [form, setForm] = useState({
    customer_email: booking.customer_email || '',
    customer_phone: booking.customer_phone || '',
    plate: booking.plate || '',
    car_make: booking.car_make || '',
    car_model: booking.car_model || '',
    car_color: booking.car_color || '',
    flight_number: booking.flight_number || '',
    notes: booking.notes || '',
    start_at: booking.start_at ? new Date(booking.start_at).toISOString().slice(0, 16) : '',
    end_at: booking.end_at ? new Date(booking.end_at).toISOString().slice(0, 16) : '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const res = await fetch(`/api/bookings/${booking.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    const json = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      toast({
        title: "Error",
        description: json?.error || 'Update failed',
        variant: "destructive",
      });
      return;
    }

    onSaved();
  };

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Start Date & Time</label>
          <input
            type="datetime-local"
            className="w-full border rounded p-2"
            value={form.start_at}
            onChange={e=>setForm(prev=>({ ...prev, start_at: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">End Date & Time</label>
          <input
            type="datetime-local"
            className="w-full border rounded p-2"
            value={form.end_at}
            onChange={e=>setForm(prev=>({ ...prev, end_at: e.target.value }))}
          />
        </div>
      </div>
      
      {['customer_email','customer_phone','plate','car_make','car_model','car_color','flight_number'].map((k) => (
        <div key={k}>
          <label className="block text-xs text-gray-500 mb-1">{k.replace('_',' ')}</label>
          <input
            className="w-full border rounded p-2"
            value={(form as any)[k]}
            onChange={e=>setForm(prev=>({ ...prev, [k]: e.target.value }))}
          />
        </div>
      ))}
      <div>
        <label className="block text-xs text-gray-500 mb-1">notes</label>
        <textarea className="w-full border rounded p-2" value={form.notes}
          onChange={e=>setForm(prev=>({ ...prev, notes: e.target.value }))} />
      </div>
      <button onClick={save} disabled={saving} className="px-4 py-2 rounded bg-black text-white w-fit">
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}

function ExtendForm({ booking, onExtended }: { booking: any; onExtended: () => void }) {
  const [newEndAt, setNewEndAt] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [manual, setManual] = useState<boolean>(false);
  const [manualAmountCents, setManualAmountCents] = useState<number>(0);
  const [quoting, setQuoting] = useState(false);
  const [quoteCents, setQuoteCents] = useState<number>(0);
  const [pk, setPk] = useState<string>('');
  const [clientSecret, setClientSecret] = useState<string>('');
  const [amountCents, setAmountCents] = useState<number>(0);
  const [confirming, setConfirming] = useState(false);

  const calcQuote = async () => {
    if (!newEndAt) return;
    setQuoting(true);
    const res = await fetch('/api/bookings/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: booking.tenant_id, prevEndAt: booking.end_at, newEndAt }),
    });
    const json = await res.json();
    setQuoteCents(json.amountCents || 0);
    setQuoting(false);
  };

  const createIntent = async () => {
    const res = await fetch('/api/stripe/extensions/create-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId: booking.id,
        tenantId: booking.tenant_id,
        prevEndAt: booking.end_at,
        newEndAt,
        note,
        manualAmountCents: manual ? manualAmountCents : undefined,
      }),
    });
    const json = await res.json();
    if (json.clientSecret) {
      setPk(json.publishableKey);
      setClientSecret(json.clientSecret);
      setAmountCents(json.amountCents);
    }
  };

  const confirm = async () => {
    if (!clientSecret || !pk) return;
    setConfirming(true);
    const { loadStripe } = await import('@stripe/stripe-js');
    const stripe = await loadStripe(pk);
    const { error } = await stripe!.confirmCardPayment(clientSecret);
    setConfirming(false);
    if (!error) onExtended();
  };

  return (
    <div className="grid gap-4">
      <div>
        <label className="block text-xs text-gray-500 mb-1">New end date/time</label>
        <input type="datetime-local" className="border rounded p-2"
               value={newEndAt}
               onChange={e=>setNewEndAt(e.target.value)} />
        <button className="ml-2 text-sm underline" onClick={calcQuote} disabled={!newEndAt || quoting}>
          {quoting ? 'Quoting…' : 'Get auto-quote'}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <input id="manual" type="checkbox" checked={manual} onChange={e=>setManual(e.target.checked)} />
        <label htmlFor="manual">Manual price override</label>
      </div>

      {manual ? (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Amount (pence)</label>
          <input type="number" className="border rounded p-2"
                 value={manualAmountCents}
                 onChange={e=>setManualAmountCents(parseInt(e.target.value||'0',10))}/>
        </div>
      ) : (
        <div className="text-sm text-gray-700">Auto quote: <b>{toMoney(quoteCents)}</b></div>
      )}

      <div>
        <label className="block text-xs text-gray-500 mb-1">Note (optional)</label>
        <input className="border rounded p-2 w-full" value={note} onChange={e=>setNote(e.target.value)} />
      </div>

      {!clientSecret ? (
        <button
          className="px-4 py-2 rounded bg-black text-white w-fit"
          onClick={createIntent}
          disabled={!newEndAt}
        >
          Create payment & record extension
        </button>
      ) : (
        <div className="flex items-center gap-3">
          <div>To charge: <b>{toMoney(amountCents)}</b></div>
          <button
            className="px-4 py-2 rounded bg-black text-white"
            onClick={confirm}
            disabled={confirming}
          >
            {confirming ? 'Confirming…' : 'Confirm Payment'}
          </button>
        </div>
      )}
    </div>
  );
}

function RefundForm({ booking, onRefunded }: { booking: any; onRefunded: () => void }) {
  const [refundAmount, setRefundAmount] = useState<number>(0);
  const [reason, setReason] = useState<string>('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string>('');

  React.useEffect(() => {
    if (booking.money_charged && refundAmount === 0) {
      setRefundAmount(Math.round(booking.money_charged * 100));
    }
  }, [booking.money_charged, refundAmount]);

  const processRefund = async () => {
    if (!booking.stripe_payment_intent_id) {
      setError('No payment intent found for this booking');
      return;
    }

    if (refundAmount <= 0) {
      setError('Refund amount must be greater than 0');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const res = await fetch('/api/bookings/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.id,
          tenantId: booking.tenant_id,
          paymentIntentId: booking.stripe_payment_intent_id,
          amount: refundAmount,
          reason: reason || 'requested_by_customer'
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Refund failed');
      }

      onRefunded();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Refund Amount (pence)</label>
        <input 
          type="number" 
          className="border rounded p-2 w-full"
          value={refundAmount}
          onChange={e => setRefundAmount(parseInt(e.target.value || '0', 10))}
          min="1"
          max={Math.round((booking.money_charged || 0) * 100)}
        />
        <div className="text-xs text-gray-500 mt-1">
          Original charge: {toMoney(Math.round((booking.money_charged || 0) * 100))}
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Reason (optional)</label>
        <select 
          className="border rounded p-2 w-full"
          value={reason}
          onChange={e => setReason(e.target.value)}
        >
          <option value="">Select a reason</option>
          <option value="requested_by_customer">Requested by customer</option>
          <option value="duplicate">Duplicate payment</option>
          <option value="fraudulent">Fraudulent</option>
          <option value="other">Other</option>
        </select>
      </div>

      {error && (
        <div className="text-red-600 text-sm">{error}</div>
      )}

      <div className="flex items-center gap-3">
        <button
          className="px-4 py-2 rounded bg-red-600 text-white"
          onClick={processRefund}
          disabled={processing || !booking.stripe_payment_intent_id}
        >
          {processing ? 'Processing Refund...' : 'Process Refund'}
        </button>
        
        {!booking.stripe_payment_intent_id && (
          <span className="text-sm text-gray-500">No payment found for this booking</span>
        )}
      </div>
    </div>
  );
}


