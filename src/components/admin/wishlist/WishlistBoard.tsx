"use client";

// Wishlist and bugs: everything your car park has asked for or reported (every car park's, for
// platform admins). Search and filter, sort by newest or most wanted, open a request to see it,
// back it with "Me too", edit or delete your own, and, as a platform admin, set its status and reply.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, MessageSquare, Paperclip, Plus, RefreshCw, Search, ThumbsUp } from "lucide-react";
import {
  AREAS,
  KINDS,
  KIND_LABELS,
  STATUSES,
  STATUS_LABELS,
  matchesFilters,
  sortItems,
  type SortKey,
  type StatusFilter,
  type WishlistKind,
  type WishlistView,
} from "@/lib/wishlist/fields";
import WishlistForm from "./WishlistForm";
import WishlistItemDialog from "./WishlistItemDialog";
import { KindBadge, StatusBadge } from "./WishlistBadges";

const selectClass = "h-9 rounded-md border border-gray-200 bg-white px-2 text-sm";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
}

export default function WishlistBoard() {
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get("item");

  const [items, setItems] = useState<WishlistView[]>([]);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<WishlistKind | "all">("all");
  const [area, setArea] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [sort, setSort] = useState<SortKey>("newest");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/wishlist", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load the list");
      setItems(data.items ?? []);
      setIsPlatformAdmin(Boolean(data.isPlatformAdmin));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(
    () => sortItems(items.filter((i) => matchesFilters(i, { kind, area, status, search })), sort),
    [items, kind, area, status, search, sort]
  );

  const openItem = items.find((i) => i.id === openId) ?? null;
  const setOpenId = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("item", id);
    else next.delete("item");
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };

  const patchItem = (id: string, patch: Partial<WishlistView>) =>
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Wishlist and bugs</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            Ask for something new, request a change, or report a bug or anything that behaves oddly. Everyone at your car park
            can see the list, so check whether it&apos;s already been asked for. If it has, click <strong>Me too</strong>.
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New request
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="pl-8 h-9" />
            </div>
            <select aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value as WishlistKind | "all")} className={selectClass}>
              <option value="all">All types</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <select aria-label="Area" value={area} onChange={(e) => setArea(e.target.value)} className={selectClass}>
              <option value="all">All areas</option>
              {AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className={selectClass}>
              <option value="open">Open (new and planned)</option>
              <option value="all">Any status</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={selectClass}>
              <option value="newest">Newest first</option>
              <option value="wanted">Most wanted</option>
            </select>
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading} aria-label="Refresh">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>

          {error ? (
            <p className="text-sm text-rose-600">{error}</p>
          ) : loading && items.length === 0 ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              {items.length === 0 ? "Nothing has been asked for yet." : "Nothing matches these filters."}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {shown.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(i.id)}
                    className="w-full text-left py-3 px-2 -mx-2 rounded hover:bg-gray-50 flex items-start gap-3"
                  >
                    <div className="flex flex-col items-center w-10 shrink-0 pt-0.5 text-gray-500" title={`${i.votes + 1} ${i.votes === 0 ? "person wants" : "people want"} this`}>
                      <ThumbsUp className={`h-4 w-4 ${i.voted ? "text-blue-600 fill-blue-100" : ""}`} />
                      <span className="text-xs mt-0.5">{i.votes + 1}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <KindBadge kind={i.kind} />
                        <span className="font-medium text-gray-900">{i.title}</span>
                        <StatusBadge status={i.status} />
                      </div>
                      <p className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-x-2">
                        <span>{i.area}</span>
                        <span>·</span>
                        <span>
                          {i.mine ? "You" : i.created_by_name || i.created_by_email || "Someone"}, {formatDate(i.created_at)}
                        </span>
                        {isPlatformAdmin && i.tenant_name && (
                          <>
                            <span>·</span>
                            <span>{i.tenant_name}</span>
                          </>
                        )}
                        {i.files.length > 0 && (
                          <span className="inline-flex items-center gap-0.5">
                            <Paperclip className="h-3 w-3" /> {i.files.length}
                          </span>
                        )}
                        {i.reply && (
                          <span className="inline-flex items-center gap-0.5 text-blue-700">
                            <MessageSquare className="h-3 w-3" /> Reply
                          </span>
                        )}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <WishlistForm open={formOpen} onOpenChange={setFormOpen} onSaved={() => void load()} />
      <WishlistItemDialog
        item={openItem}
        isPlatformAdmin={isPlatformAdmin}
        onClose={() => setOpenId(null)}
        onChanged={(patch) => openItem && patchItem(openItem.id, patch)}
        onReload={() => void load()}
        onDeleted={() => {
          if (openItem) setItems((l) => l.filter((x) => x.id !== openItem.id));
          setOpenId(null);
        }}
      />
    </div>
  );
}
