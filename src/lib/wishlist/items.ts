// Wishlist and bugs: who is asking, and the reads and writes behind /api/admin/wishlist.
// Everything goes through the service role after a session check here: people see their own car
// park's requests, platform admins see every car park's.

import 'server-only';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { isPlatformAdmin } from '@/lib/guards';
import { escapeHtml } from '@/lib/wishlist/html';
import { sendAdminEmail, sendEmail } from '@/lib/email';
import {
  KIND_LABELS,
  STATUS_LABELS,
  WISHLIST_BUCKET,
  type ItemInput,
  type TriageInput,
  type WishlistItem,
  type WishlistView,
} from './fields';

export type WishlistViewer = {
  userId: string;
  tenantId: string;
  name: string | null;
  email: string | null;
  isPlatformAdmin: boolean;
};

/** The signed-in person and their current car park, or null when signed out / no car park. */
export async function getWishlistViewer(): Promise<WishlistViewer | null> {
  const sb = await createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const ctx = await getCurrentTenantContext();
  if (!ctx) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name = [meta.full_name, meta.name].find((v): v is string => typeof v === 'string' && v.trim() !== '') ?? null;
  return {
    userId: user.id,
    tenantId: ctx.tenantId,
    name: name?.trim() ?? null,
    email: user.email ?? null,
    isPlatformAdmin: await isPlatformAdmin(user.id),
  };
}

export function canSeeItem(viewer: WishlistViewer, item: Pick<WishlistItem, 'tenant_id'>): boolean {
  return viewer.isPlatformAdmin || item.tenant_id === viewer.tenantId;
}

const db = () => createAdminClient();

export async function listItems(viewer: WishlistViewer): Promise<WishlistView[]> {
  let q = db().from('wishlist_items').select('*').order('created_at', { ascending: false }).limit(500);
  if (!viewer.isPlatformAdmin) q = q.eq('tenant_id', viewer.tenantId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const items = (data ?? []) as WishlistItem[];
  if (items.length === 0) return [];

  const ids = items.map((i) => i.id);
  const tenantIds = [...new Set(items.map((i) => i.tenant_id))];
  const [{ data: votes }, { data: tenants }] = await Promise.all([
    db().from('wishlist_votes').select('item_id, user_id').in('item_id', ids),
    db().from('tenants').select('id, name').in('id', tenantIds),
  ]);
  const tenantName = new Map((tenants ?? []).map((t: { id: string; name: string }) => [t.id, t.name]));
  const count = new Map<string, number>();
  const mineVoted = new Set<string>();
  for (const v of (votes ?? []) as { item_id: string; user_id: string }[]) {
    count.set(v.item_id, (count.get(v.item_id) ?? 0) + 1);
    if (v.user_id === viewer.userId) mineVoted.add(v.item_id);
  }
  return items.map((i) => ({
    ...i,
    links: i.links ?? [],
    files: i.files ?? [],
    votes: count.get(i.id) ?? 0,
    voted: mineVoted.has(i.id),
    mine: i.created_by === viewer.userId,
    tenant_name: tenantName.get(i.tenant_id) ?? null,
  }));
}

export async function getItem(id: string): Promise<WishlistItem | null> {
  const { data } = await db().from('wishlist_items').select('*').eq('id', id).maybeSingle();
  return (data as WishlistItem | null) ?? null;
}

export async function createItem(viewer: WishlistViewer, input: ItemInput): Promise<WishlistItem> {
  const { data, error } = await db()
    .from('wishlist_items')
    .insert({
      tenant_id: viewer.tenantId,
      ...input,
      created_by: viewer.userId,
      created_by_name: viewer.name,
      created_by_email: viewer.email,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not save the request');
  return data as WishlistItem;
}

export async function updateItem(id: string, input: ItemInput, files?: string[]): Promise<void> {
  const { error } = await db()
    .from('wishlist_items')
    .update({ ...input, ...(files ? { files } : {}), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setFiles(id: string, files: string[]): Promise<void> {
  const { error } = await db().from('wishlist_items').update({ files }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteItem(item: WishlistItem): Promise<void> {
  if (item.files?.length) await db().storage.from(WISHLIST_BUCKET).remove(item.files);
  const { error } = await db().from('wishlist_items').delete().eq('id', item.id);
  if (error) throw new Error(error.message);
}

export async function uploadFile(path: string, file: File): Promise<void> {
  const { error } = await db()
    .storage.from(WISHLIST_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
  if (error) throw new Error(`Could not upload ${file.name}: ${error.message}`);
}

export async function removeFiles(paths: string[]): Promise<void> {
  if (paths.length) await db().storage.from(WISHLIST_BUCKET).remove(paths);
}

export async function signedFileUrl(path: string, seconds = 300): Promise<string | null> {
  const { data, error } = await db().storage.from(WISHLIST_BUCKET).createSignedUrl(path, seconds);
  return error ? null : (data?.signedUrl ?? null);
}

export async function setVote(itemId: string, userId: string, on: boolean): Promise<void> {
  const table = db().from('wishlist_votes');
  const { error } = on
    ? await table.upsert({ item_id: itemId, user_id: userId }, { onConflict: 'item_id,user_id', ignoreDuplicates: true })
    : await table.delete().eq('item_id', itemId).eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function voteSummary(itemId: string, userId: string): Promise<{ votes: number; voted: boolean }> {
  const { data } = await db().from('wishlist_votes').select('user_id').eq('item_id', itemId);
  const rows = (data ?? []) as { user_id: string }[];
  return { votes: rows.length, voted: rows.some((r) => r.user_id === userId) };
}

export async function setTriage(item: WishlistItem, next: TriageInput): Promise<void> {
  const replyChanged = (next.reply ?? null) !== (item.reply ?? null);
  const { error } = await db()
    .from('wishlist_items')
    .update({
      status: next.status,
      reply: next.reply,
      ...(replyChanged ? { replied_at: next.reply ? new Date().toISOString() : null } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', item.id);
  if (error) throw new Error(error.message);
}

// ——— Emails. Best effort: a failed email never fails the request. ———

function itemLink(origin: string, id: string) {
  return `${origin}/admin/wishlist?item=${encodeURIComponent(id)}`;
}

/** Tell the platform admins (ADMIN_NOTIFY_EMAIL) about a new request. */
export async function notifyNewItem(item: WishlistItem, origin: string): Promise<void> {
  try {
    const { data: tenant } = await db().from('tenants').select('name').eq('id', item.tenant_id).maybeSingle();
    const who = item.created_by_name || item.created_by_email || 'Someone';
    const html = `
      <p><strong>${escapeHtml(who)}</strong> at <strong>${escapeHtml(tenant?.name ?? 'a car park')}</strong>
      posted a ${escapeHtml(KIND_LABELS[item.kind].toLowerCase())} for <strong>${escapeHtml(item.area)}</strong>:</p>
      <h3>${escapeHtml(item.title)}</h3>
      ${item.description ? `<p style="white-space:pre-wrap">${escapeHtml(item.description)}</p>` : ''}
      ${item.links.length ? `<p>Links:<br>${item.links.map((l) => escapeHtml(l)).join('<br>')}</p>` : ''}
      <p><a href="${escapeHtml(itemLink(origin, item.id))}">Open it in Wishlist and bugs</a></p>`;
    await sendAdminEmail(`${KIND_LABELS[item.kind]}: ${item.title}`, html);
  } catch (err) {
    console.error('[wishlist] new item email failed', err);
  }
}

/** Tell the person who posted it when an admin changes the status or the reply. */
export async function notifyPoster(item: WishlistItem, next: TriageInput, origin: string, actorId: string): Promise<void> {
  try {
    const statusChanged = next.status !== item.status;
    const replyChanged = (next.reply ?? null) !== (item.reply ?? null) && !!next.reply;
    if ((!statusChanged && !replyChanged) || !item.created_by_email || item.created_by === actorId) return;
    const html = `
      <p>Your request <strong>${escapeHtml(item.title)}</strong> is now <strong>${escapeHtml(STATUS_LABELS[next.status])}</strong>.</p>
      ${next.reply ? `<p><strong>Reply:</strong></p><p style="white-space:pre-wrap">${escapeHtml(next.reply)}</p>` : ''}
      <p><a href="${escapeHtml(itemLink(origin, item.id))}">See it in Wishlist and bugs</a></p>`;
    await sendEmail(item.created_by_email, `Your request: ${item.title} (${STATUS_LABELS[next.status]})`, html);
  } catch (err) {
    console.error('[wishlist] poster email failed', err);
  }
}
