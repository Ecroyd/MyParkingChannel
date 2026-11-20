"use client";

// Thumbnail of a plate read's picture (close-up when there is one, otherwise the full shot).
// Click to see the full shot. Images come through /api/admin/anpr/picture, which redirects to a
// short-lived signed URL, so nothing is ever public.

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = {
  tenantId: string | null | undefined;
  eventId: string;
  pictures: { plate: boolean; scene: boolean } | null | undefined;
  label?: string;
  className?: string;
};

function pictureUrl(tenantId: string, eventId: string, kind: "plate" | "scene") {
  return `/api/admin/anpr/picture?tenantId=${encodeURIComponent(tenantId)}&eventId=${encodeURIComponent(eventId)}&kind=${kind}`;
}

export default function AnprPictureThumb({ tenantId, eventId, pictures, label, className }: Props) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  if (!tenantId || !pictures || (!pictures.plate && !pictures.scene) || broken) return null;

  const thumbKind = pictures.plate ? "plate" : "scene";
  const kinds = (["scene", "plate"] as const).filter((k) => pictures[k]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`shrink-0 overflow-hidden rounded border border-gray-200 bg-gray-100 hover:ring-2 hover:ring-gray-300 ${className ?? "h-10 w-16"}`}
        aria-label={`Show picture${label ? ` of ${label}` : ""}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL via redirect */}
        <img
          src={pictureUrl(tenantId, eventId, thumbKind)}
          alt={label ? `Camera picture of ${label}` : "Camera picture"}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{label ?? "Camera picture"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {open &&
              kinds.map((k) => (
                // eslint-disable-next-line @next/next/no-img-element -- signed storage URL via redirect
                <img
                  key={k}
                  src={pictureUrl(tenantId, eventId, k)}
                  alt={k === "plate" ? "Number plate close-up" : "Camera picture"}
                  className={k === "plate" ? "max-h-40 rounded border" : "w-full rounded border"}
                />
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
