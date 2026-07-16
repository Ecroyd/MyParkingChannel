"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

type BookingRow = {
  id?: string;
  reference?: string | null;
  gate_status?: string | null;
  status?: string | null;
  anpr_status?: string | null;
  departed_at?: string | null;
  checked_out_at?: string | null;
};

type Preview = {
  proposedCount: number;
  excludedCancelledOrNoShow: number;
  disputedMissingArrival: BookingRow[];
  keyRequiredNotArrived: BookingRow[];
  departedButMarkedOnSite: BookingRow[];
  openCancelledOrNoShow: BookingRow[];
  message: string;
  reliableFrom: string | null;
};

export default function OccupancyBaselineDialog({
  tenantId,
  onSaved,
}: {
  tenantId: string;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reviewedMissing, setReviewedMissing] = useState<Record<string, boolean>>({});
  const [reviewedDeparted, setReviewedDeparted] = useState<Record<string, boolean>>({});

  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/occupancy/baseline?tenant_id=${tenantId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load baseline preview");
      setPreview(json);
      const missing: Record<string, boolean> = {};
      for (const row of json.disputedMissingArrival ?? []) {
        if (row.id) missing[row.id] = false;
      }
      setReviewedMissing(missing);
      const departed: Record<string, boolean> = {};
      for (const row of json.departedButMarkedOnSite ?? []) {
        if (row.id) departed[row.id] = false;
      }
      setReviewedDeparted(departed);
    } catch (err) {
      toast({
        title: "Could not load baseline preview",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [tenantId, toast]);

  const allMissingReviewed =
    !preview?.disputedMissingArrival?.length ||
    preview.disputedMissingArrival.every((r) => r.id && reviewedMissing[r.id]);
  const allDepartedReviewed =
    !preview?.departedButMarkedOnSite?.length ||
    preview.departedButMarkedOnSite.every((r) => r.id && reviewedDeparted[r.id]);

  const confirm = async () => {
    if (!preview || !allMissingReviewed || !allDepartedReviewed) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/occupancy/baseline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          occupiedCount: preview.proposedCount,
          reviewedMissingArrivalIds: Object.entries(reviewedMissing)
            .filter(([, v]) => v)
            .map(([id]) => id),
          reviewedDepartedInconsistencyIds: Object.entries(reviewedDeparted)
            .filter(([, v]) => v)
            .map(([id]) => id),
          confirmDisputedReview: true as const,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to set baseline");
      toast({
        title: "Occupancy baseline set",
        description: `Baseline ${json.occupiedCount} at ${new Date(json.snapshotAt).toLocaleString("en-GB")}`,
      });
      setOpen(false);
      onSaved?.();
    } catch (err) {
      toast({
        title: "Baseline not saved",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void loadPreview();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Set occupancy baseline
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Set occupancy baseline</DialogTitle>
          <DialogDescription>
            Confirms the current occupied count and starts the Actual occupancy ledger from this
            moment. take_key bookings are not parked and are excluded.
          </DialogDescription>
        </DialogHeader>

        {loading || !preview ? (
          <p className="text-sm text-muted-foreground">Loading disputed records…</p>
        ) : (
          <div className="space-y-4 text-sm">
            <p>
              Proposed authoritative count:{" "}
              <span className="font-semibold">{preview.proposedCount}</span>
            </p>
            <p className="text-muted-foreground">
              Excluded cancelled/no-show open rows: {preview.excludedCancelledOrNoShow}
            </p>

            {(preview.keyRequiredNotArrived?.length ?? 0) > 0 && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-800">
                <p className="font-medium">
                  Key required — vehicle not yet recorded as arrived (
                  {preview.keyRequiredNotArrived.length})
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  These take_key bookings are excluded from Currently Parked and the baseline.
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {preview.keyRequiredNotArrived.slice(0, 12).map((r) => (
                    <li key={r.id}>{r.reference || r.id}</li>
                  ))}
                </ul>
              </div>
            )}

            {(preview.openCancelledOrNoShow?.length ?? 0) > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <p className="font-medium">Open but cancelled/no-show (excluded automatically)</p>
                <ul className="mt-1 list-disc pl-5">
                  {preview.openCancelledOrNoShow.slice(0, 10).map((r) => (
                    <li key={r.id}>{r.reference || r.id}</li>
                  ))}
                </ul>
              </div>
            )}

            {(preview.departedButMarkedOnSite?.length ?? 0) > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-900">
                <p className="font-medium">
                  State inconsistency — departed timestamp but still marked on-site (
                  {preview.departedButMarkedOnSite.length})
                </p>
                <ul className="mt-2 space-y-2">
                  {preview.departedButMarkedOnSite.map((r) => (
                    <li key={r.id} className="flex items-start gap-2">
                      <Checkbox
                        checked={Boolean(r.id && reviewedDeparted[r.id])}
                        onCheckedChange={(checked) => {
                          if (!r.id) return;
                          setReviewedDeparted((prev) => ({ ...prev, [r.id!]: Boolean(checked) }));
                        }}
                      />
                      <span>
                        {r.reference || r.id} — gate={r.gate_status}, status={r.status}, anpr=
                        {r.anpr_status}, departed={r.departed_at || r.checked_out_at}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(preview.disputedMissingArrival?.length ?? 0) > 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <p className="font-medium">
                  Marked on-site but missing arrival timestamp (
                  {preview.disputedMissingArrival.length}) — review each before confirming
                </p>
                <ul className="mt-2 space-y-2">
                  {preview.disputedMissingArrival.map((r) => (
                    <li key={r.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={Boolean(r.id && reviewedMissing[r.id])}
                        onCheckedChange={(checked) => {
                          if (!r.id) return;
                          setReviewedMissing((prev) => ({ ...prev, [r.id!]: Boolean(checked) }));
                        }}
                      />
                      <span>
                        {r.reference || r.id} ({r.gate_status})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-muted-foreground">{preview.message}</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!preview || !allMissingReviewed || !allDepartedReviewed || saving}
            onClick={() => void confirm()}
          >
            {saving ? "Saving…" : `Confirm baseline (${preview?.proposedCount ?? "—"})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
