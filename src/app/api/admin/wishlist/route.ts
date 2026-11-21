// GET  /api/admin/wishlist  → { items, isPlatformAdmin, userId }
// POST /api/admin/wishlist  (multipart: data JSON + files) → { id }
//
// Anyone signed in to a car park's admin can read its requests and post one. Platform admins see
// every car park's.

import { after, NextRequest, NextResponse } from 'next/server';
import { filePath } from '@/lib/wishlist/fields';
import { parseItemForm } from '@/lib/wishlist/formData';
import {
  createItem,
  deleteItem,
  getWishlistViewer,
  listItems,
  notifyNewItem,
  setFiles,
  uploadFile,
} from '@/lib/wishlist/items';

export const runtime = 'nodejs';

export async function GET() {
  const viewer = await getWishlistViewer();
  if (!viewer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const items = await listItems(viewer);
    return NextResponse.json({ items, isPlatformAdmin: viewer.isPlatformAdmin, userId: viewer.userId });
  } catch (err) {
    console.error('[wishlist] list failed', err);
    const missing = err instanceof Error && /wishlist_items/.test(err.message);
    return NextResponse.json(
      { error: missing ? 'Wishlist and bugs is not set up yet (the database migration has not been run).' : 'Could not load the list' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const viewer = await getWishlistViewer();
  if (!viewer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const form = await parseItemForm(req);
  if (!form.ok) return NextResponse.json({ error: form.error }, { status: 400 });

  let item;
  try {
    item = await createItem(viewer, form.input);
  } catch (err) {
    console.error('[wishlist] create failed', err);
    return NextResponse.json({ error: 'Could not save the request' }, { status: 500 });
  }

  if (form.files.length) {
    const paths = form.files.map((f, i) => filePath(viewer.tenantId, item.id, i, f.name));
    try {
      await Promise.all(form.files.map((f, i) => uploadFile(paths[i], f)));
      await setFiles(item.id, paths);
      item = { ...item, files: paths };
    } catch (err) {
      // Don't leave a request behind without the screenshots the person attached.
      await deleteItem({ ...item, files: paths }).catch(() => {});
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not upload the files' }, { status: 500 });
    }
  }

  const origin = req.nextUrl.origin;
  const saved = item;
  after(() => notifyNewItem(saved, origin));
  return NextResponse.json({ id: item.id });
}
