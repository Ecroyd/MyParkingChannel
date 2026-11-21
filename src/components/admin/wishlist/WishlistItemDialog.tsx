"use client";

// One request, opened from the list: its details, screenshots and links, "Me too", Edit and
// Delete for the person who posted it, and the status-and-reply panel for platform admins.

import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { ExternalLink, Loader2, Paperclip, Pencil, ThumbsUp, Trash2 } from "lucide-react";
import { STATUSES, STATUS_LABELS, fileLabel, isImagePath, type WishlistStatus, type WishlistView } from "@/lib/wishlist/fields";
import { KindBadge, StatusBadge } from "./WishlistBadges";
import WishlistForm from "./WishlistForm";

type Props = {
  item: WishlistView | null;
  isPlatformAdmin: boolean;
  onClose: () => void;
  onChanged: (patch: Partial<WishlistView>) => void;
  onReload: () => void;
  onDeleted: () => void;
};

function fileUrl(id: string, path: string) {
  return `/api/admin/wishlist/${id}/file?path=${encodeURIComponent(path)}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

export default function WishlistItemDialog({ item, isPlatformAdmin, onClose, onChanged, onReload, onDeleted }: Props) {
  const [voting, setVoting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<WishlistStatus>("new");
  const [reply, setReply] = useState("");
  const [savingTriage, setSavingTriage] = useState(false);

  useEffect(() => {
    if (!item) return;
    setStatus(item.status);
    setReply(item.reply ?? "");
    setConfirmDelete(false);
  }, [item]);

  if (!item && !editing) return null;

  const toggleVote = async () => {
    if (!item) return;
    setVoting(true);
    try {
      const res = await fetch(`/api/admin/wishlist/${item.id}/vote`, { method: item.voted ? "DELETE" : "PUT" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save");
      onChanged({ votes: data.votes, voted: data.voted });
    } catch (err) {
      toast({ title: "Couldn't save", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setVoting(false);
    }
  };

  const remove = async () => {
    if (!item) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/wishlist/${item.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not delete");
      toast({ title: "Request deleted" });
      onDeleted();
    } catch (err) {
      toast({ title: "Couldn't delete", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const saveTriage = async () => {
    if (!item) return;
    setSavingTriage(true);
    try {
      const res = await fetch(`/api/admin/wishlist/${item.id}/triage`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, reply }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save");
      const r = reply.trim() || null;
      onChanged({ status, reply: r, replied_at: r !== item.reply ? (r ? new Date().toISOString() : null) : item.replied_at });
      toast({ title: "Status and reply saved", description: item.mine ? undefined : "The person who posted it has been emailed." });
    } catch (err) {
      toast({ title: "Couldn't save", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setSavingTriage(false);
    }
  };

  const images = item?.files.filter(isImagePath) ?? [];
  const others = item?.files.filter((p) => !isImagePath(p)) ?? [];
  const canEdit = !!item && (item.mine || isPlatformAdmin);

  return (
    <>
      <Dialog open={!!item && !editing} onOpenChange={(o) => !o && onClose()}>
        {item && (
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2 pr-6">
                <KindBadge kind={item.kind} />
                <StatusBadge status={item.status} />
                <span className="text-xs text-gray-500">{item.area}</span>
              </div>
              <DialogTitle className="text-xl">{item.title}</DialogTitle>
              <p className="text-xs text-gray-500">
                {item.mine ? "You" : item.created_by_name || item.created_by_email || "Someone"}
                {isPlatformAdmin && item.tenant_name ? ` at ${item.tenant_name}` : ""}, {formatDateTime(item.created_at)}
              </p>
            </DialogHeader>

            <div className="space-y-4">
              {item.description ? (
                <p className="text-sm whitespace-pre-wrap text-gray-800">{item.description}</p>
              ) : (
                <p className="text-sm text-gray-400">No description.</p>
              )}

              {images.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {images.map((p) => (
                    <a key={p} href={fileUrl(item.id, p)} target="_blank" rel="noreferrer" className="block rounded border overflow-hidden hover:ring-2 hover:ring-gray-300">
                      {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL via redirect */}
                      <img src={fileUrl(item.id, p)} alt={fileLabel(p)} className="w-full max-h-64 object-contain bg-gray-50" loading="lazy" />
                    </a>
                  ))}
                </div>
              )}
              {others.length > 0 && (
                <ul className="space-y-1">
                  {others.map((p) => (
                    <li key={p}>
                      <a href={fileUrl(item.id, p)} target="_blank" rel="noreferrer" className="text-sm text-blue-700 hover:underline inline-flex items-center gap-1">
                        <Paperclip className="h-3.5 w-3.5" /> {fileLabel(p)}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {item.links.length > 0 && (
                <ul className="space-y-1">
                  {item.links.map((l) => (
                    <li key={l}>
                      <a href={l} target="_blank" rel="noreferrer" className="text-sm text-blue-700 hover:underline inline-flex items-center gap-1 break-all">
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" /> {l}
                      </a>
                    </li>
                  ))}
                </ul>
              )}

              {item.reply && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
                  <p className="text-xs font-medium text-blue-800 mb-1">
                    Reply{item.replied_at ? `, ${formatDateTime(item.replied_at)}` : ""}
                  </p>
                  <p className="text-sm whitespace-pre-wrap text-blue-950">{item.reply}</p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {!item.mine && (
                  <Button variant={item.voted ? "default" : "outline"} size="sm" onClick={() => void toggleVote()} disabled={voting}>
                    {voting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ThumbsUp className="h-4 w-4 mr-1" />}
                    {item.voted ? "You want this too" : "Me too"}
                  </Button>
                )}
                <span className="text-xs text-gray-500">
                  {item.votes === 0 ? "No one else has backed this yet." : `${item.votes} ${item.votes === 1 ? "other person wants" : "other people want"} this.`}
                </span>
                {canEdit && (
                  <div className="ml-auto flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                      <Pencil className="h-4 w-4 mr-1" /> Edit
                    </Button>
                    {confirmDelete ? (
                      <Button variant="destructive" size="sm" onClick={() => void remove()} disabled={deleting}>
                        {deleting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Delete it
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
                        <Trash2 className="h-4 w-4 mr-1" /> Delete
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {isPlatformAdmin && (
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-3">
                  <p className="text-sm font-medium">Admin (only platform admins see this)</p>
                  <div className="flex flex-wrap gap-2">
                    {STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(s)}
                        className={`rounded-full border px-3 py-1 text-sm ${status === s ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white hover:bg-gray-100"}`}
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wl-reply">Reply (everyone who can see this request reads it)</Label>
                    <Textarea id="wl-reply" value={reply} onChange={(e) => setReply(e.target.value)} rows={3} />
                  </div>
                  <Button size="sm" onClick={() => void saveTriage()} disabled={savingTriage}>
                    {savingTriage && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Save status and reply
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
      <WishlistForm
        open={editing}
        onOpenChange={setEditing}
        item={item}
        onSaved={() => {
          setEditing(false);
          onReload();
        }}
      />
    </>
  );
}
