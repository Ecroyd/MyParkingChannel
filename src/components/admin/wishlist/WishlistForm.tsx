"use client";

// New request / edit request window. Screenshots can be pasted (Ctrl+V / Cmd+V), dropped in, or
// chosen. Used by the Wishlist and bugs page and by the top bar's "Report a problem" button.

import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { ImagePlus, Loader2, Paperclip, Plus, X } from "lucide-react";
import {
  AREAS,
  KINDS,
  KIND_LABELS,
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_LINKS,
  fileLabel,
  isImagePath,
  type WishlistKind,
  type WishlistView,
} from "@/lib/wishlist/fields";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing an existing request; otherwise a new one. */
  item?: WishlistView | null;
  initialKind?: WishlistKind;
  initialLink?: string | null;
  initialArea?: string | null;
  onSaved?: (id: string) => void;
};

const KIND_HINTS: Record<WishlistKind, string> = {
  feature: "Something new you'd like it to do.",
  change: "Something that works but should work differently.",
  bug: "Something broken or behaving oddly.",
};

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function WishlistForm({ open, onOpenChange, item, initialKind, initialLink, initialArea, onSaved }: Props) {
  const [kind, setKind] = useState<WishlistKind>("feature");
  const [area, setArea] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [links, setLinks] = useState<string[]>([""]);
  const [keep, setKeep] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Fill the form each time it opens.
  useEffect(() => {
    if (!open) return;
    setKind(item?.kind ?? initialKind ?? "feature");
    setArea(item?.area ?? initialArea ?? "");
    setTitle(item?.title ?? "");
    setDescription(item?.description ?? "");
    setLinks(item?.links.length ? item.links : [initialLink ?? ""]);
    setKeep(item?.files ?? []);
    setFiles([]);
    setError(null);
  }, [open, item, initialKind, initialLink, initialArea]);

  const addFiles = (list: FileList | File[]) => {
    const incoming = Array.from(list).filter((f) => f.size > 0);
    const tooBig = incoming.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      setError(`${tooBig.name || "That file"} is over ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
      return;
    }
    setFiles((prev) => {
      const next = [...prev, ...incoming].slice(0, Math.max(0, MAX_FILES - keep.length));
      if (next.length < prev.length + incoming.length) setError(`Add at most ${MAX_FILES} files.`);
      return next;
    });
  };

  // Pasting a screenshot anywhere in the window adds it.
  const onPaste = (e: React.ClipboardEvent) => {
    const pasted = Array.from(e.clipboardData.files);
    if (pasted.length === 0) return;
    e.preventDefault();
    addFiles(
      pasted.map((f) =>
        f.name && f.name !== "image.png"
          ? f
          : new File([f], `screenshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`, { type: f.type })
      )
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!area) {
      setError("Choose the area it's about.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("data", JSON.stringify({ kind, area, title, description, links: links.filter((l) => l.trim()) }));
      if (item) body.set("keep", JSON.stringify(keep));
      for (const f of files) body.append("files", f, f.name);
      const res = await fetch(item ? `/api/admin/wishlist/${item.id}` : "/api/admin/wishlist", {
        method: item ? "PATCH" : "POST",
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not send");
      toast({ title: item ? "Request updated" : "Thanks, your request has been sent" });
      onOpenChange(false);
      onSaved?.(item?.id ?? data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const fileCount = keep.length + files.length;

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onPaste={onPaste}>
        <DialogHeader>
          <DialogTitle>{item ? "Edit request" : kind === "bug" && initialLink ? "Report a problem" : "New request"}</DialogTitle>
          <DialogDescription>
            Ask for something new, request a change, or report a bug. Everyone at your car park can see the list.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <fieldset>
            <legend className="text-sm font-medium mb-2">What is it?</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {KINDS.map((k) => (
                <label
                  key={k}
                  className={`cursor-pointer rounded-md border p-3 text-sm ${kind === k ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:bg-gray-50"}`}
                >
                  <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
                  <span className="font-medium block">{KIND_LABELS[k]}</span>
                  <span className="text-gray-500 text-xs">{KIND_HINTS[k]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="wl-area">Area</Label>
              <select id="wl-area" value={area} onChange={(e) => setArea(e.target.value)} className={selectClass} required>
                <option value="" disabled>
                  Choose…
                </option>
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wl-title">Title</Label>
              <Input id="wl-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required placeholder="A short summary" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wl-description">Description</Label>
            <Textarea
              id="wl-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder={
                kind === "bug"
                  ? "What did you do, what did you expect, and what happened instead?"
                  : "What would you like, and why would it help?"
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label>Screenshots and files</Label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              className={`rounded-md border-2 border-dashed p-4 text-center text-sm ${dragging ? "border-gray-900 bg-gray-50" : "border-gray-200"}`}
            >
              <p className="text-gray-600">
                Paste a screenshot (Ctrl+V or ⌘V), drag files here, or{" "}
                <button type="button" className="font-medium underline" onClick={() => fileInput.current?.click()}>
                  choose files
                </button>
                .
              </p>
              <input
                ref={fileInput}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {fileCount > 0 && (
              <ul className="flex flex-wrap gap-2 pt-1">
                {keep.map((p) => (
                  <FileChip
                    key={p}
                    name={fileLabel(p)}
                    image={isImagePath(p)}
                    src={item ? `/api/admin/wishlist/${item.id}/file?path=${encodeURIComponent(p)}` : undefined}
                    onRemove={() => setKeep((k) => k.filter((x) => x !== p))}
                  />
                ))}
                {files.map((f, i) => (
                  <NewFileChip key={`${f.name}-${i}`} file={f} onRemove={() => setFiles((fs) => fs.filter((_, j) => j !== i))} />
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Links to pages</Label>
            {links.map((l, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={l}
                  onChange={(e) => setLinks((ls) => ls.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder="Paste the address of the page it's about"
                />
                {links.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove link" onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {links.length < MAX_LINKS && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setLinks((ls) => [...ls, ""])}>
                <Plus className="h-4 w-4 mr-1" /> Add another link
              </Button>
            )}
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {item ? "Save" : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FileChip({ name, image, src, onRemove }: { name: string; image: boolean; src?: string; onRemove: () => void }) {
  return (
    <li className="flex items-center gap-2 rounded border border-gray-200 bg-white py-1 pl-1 pr-2 text-xs">
      {image && src ? (
        // eslint-disable-next-line @next/next/no-img-element -- local preview / signed storage URL
        <img src={src} alt="" className="h-10 w-14 rounded object-cover" />
      ) : image ? (
        <ImagePlus className="h-4 w-4 text-gray-500" />
      ) : (
        <Paperclip className="h-4 w-4 text-gray-500" />
      )}
      <span className="max-w-[160px] truncate">{name}</span>
      <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} className="text-gray-400 hover:text-gray-700">
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

function NewFileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string | undefined>();
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return <FileChip name={file.name} image={file.type.startsWith("image/")} src={url} onRemove={onRemove} />;
}
