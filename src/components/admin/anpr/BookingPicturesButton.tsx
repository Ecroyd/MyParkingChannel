"use client";

// Camera icon on a Today board row: opens the booking's arrival and departure camera pictures.
// Shown only when the booking has a pictured read. Images come through /api/admin/anpr/picture
// (short-lived signed URLs).

import React, { useState } from "react";
import { Camera } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BookingPictureRead, BookingPictures } from "@/lib/anpr/pictures";

function pictureUrl(tenantId: string, eventId: string, kind: "plate" | "scene") {
  return `/api/admin/anpr/picture?tenantId=${encodeURIComponent(tenantId)}&eventId=${encodeURIComponent(eventId)}&kind=${kind}`;
}

function formatAt(iso: string, timezone: string) {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
}

function ReadPictures({ title, read, tenantId, timezone }: { title: string; read: BookingPictureRead; tenantId: string; timezone: string }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900">
        {title} <span className="font-normal text-gray-500">· {formatAt(read.at, timezone)}</span>
      </h3>
      {read.scene && (
        // eslint-disable-next-line @next/next/no-img-element -- signed storage URL via redirect
        <img src={pictureUrl(tenantId, read.eventId, "scene")} alt={`${title} camera picture`} className="w-full rounded border" />
      )}
      {read.plate && (
        // eslint-disable-next-line @next/next/no-img-element -- signed storage URL via redirect
        <img src={pictureUrl(tenantId, read.eventId, "plate")} alt={`${title} number plate close-up`} className="max-h-32 rounded border" />
      )}
    </section>
  );
}

type Props = {
  tenantId: string;
  timezone: string;
  plate: string | null;
  reference: string;
  pictures: BookingPictures | undefined;
};

export default function BookingPicturesButton({ tenantId, timezone, plate, reference, pictures }: Props) {
  const [open, setOpen] = useState(false);
  if (!pictures || (!pictures.in && !pictures.out)) return null;
  const label = (plate || reference || "").toUpperCase();

  return (
    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="inline-flex">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 w-7 items-center justify-center rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
        aria-label={`Camera pictures for ${label}`}
        title="Camera pictures"
      >
        <Camera className="h-4 w-4" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {label} · {reference}
            </DialogTitle>
          </DialogHeader>
          {open && (
            <div className="space-y-6">
              {pictures.in && <ReadPictures title="Arrived" read={pictures.in} tenantId={tenantId} timezone={timezone} />}
              {pictures.out && <ReadPictures title="Left" read={pictures.out} tenantId={tenantId} timezone={timezone} />}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </span>
  );
}
