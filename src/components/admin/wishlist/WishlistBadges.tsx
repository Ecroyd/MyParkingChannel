import React from "react";
import { KIND_LABELS, STATUS_LABELS, type WishlistKind, type WishlistStatus } from "@/lib/wishlist/fields";

const KIND_CLASS: Record<WishlistKind, string> = {
  feature: "bg-violet-50 text-violet-700 border-violet-200",
  change: "bg-amber-50 text-amber-800 border-amber-200",
  bug: "bg-rose-50 text-rose-700 border-rose-200",
};

const STATUS_CLASS: Record<WishlistStatus, string> = {
  new: "bg-gray-100 text-gray-700 border-gray-200",
  planned: "bg-blue-50 text-blue-700 border-blue-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  declined: "bg-gray-50 text-gray-500 border-gray-200",
};

export function KindBadge({ kind }: { kind: WishlistKind }) {
  return <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${KIND_CLASS[kind]}`}>{KIND_LABELS[kind]}</span>;
}

export function StatusBadge({ status }: { status: WishlistStatus }) {
  return <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_CLASS[status]}`}>{STATUS_LABELS[status]}</span>;
}
