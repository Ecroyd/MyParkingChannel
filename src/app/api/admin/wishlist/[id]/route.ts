// PATCH  /api/admin/wishlist/:id  (multipart: data JSON, keep JSON [paths], files) — edit
// DELETE /api/admin/wishlist/:id — delete, with its files
// Only the person who posted it, or a platform admin.

import { NextRequest, NextResponse } from 'next/server';
import { canEditItem, filePath } from '@/lib/wishlist/fields';
import { parseItemForm } from '@/lib/wishlist/formData';
import { canSeeItem, deleteItem, getItem, getWishlistViewer, removeFiles, updateItem, uploadFile } from '@/lib/wishlist/items';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(id: string) {
  const viewer = await getWishlistViewer();
  if (!viewer) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  const item = UUID.test(id) ? await getItem(id) : null;
  if (!item || !canSeeItem(viewer, item)) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  if (!canEditItem(item, viewer.userId, viewer.isPlatformAdmin)) {
    return { error: NextResponse.json({ error: 'Only the person who posted this can change it.' }, { status: 403 }) };
  }
  return { error: null, viewer, item };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await load(id);
  if (loaded.error) return loaded.error;
  const { item } = loaded;

  const form = await parseItemForm(req);
  if (!form.ok) return NextResponse.json({ error: form.error }, { status: 400 });

  // Keep only files that really belong to this request.
  const keep = (form.keep ?? item.files).filter((p) => item.files.includes(p));
  const added = form.files.map((f, i) => filePath(item.tenant_id, item.id, i, f.name));
  try {
    await Promise.all(form.files.map((f, i) => uploadFile(added[i], f)));
    await updateItem(item.id, form.input, [...keep, ...added]);
  } catch (err) {
    await removeFiles(added).catch(() => {});
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not save' }, { status: 500 });
  }
  await removeFiles(item.files.filter((p) => !keep.includes(p))).catch(() => {});
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await load(id);
  if (loaded.error) return loaded.error;
  try {
    await deleteItem(loaded.item);
  } catch (err) {
    console.error('[wishlist] delete failed', err);
    return NextResponse.json({ error: 'Could not delete' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
