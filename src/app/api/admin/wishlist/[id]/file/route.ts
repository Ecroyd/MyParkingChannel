// GET /api/admin/wishlist/:id/file?path= — redirects to a short-lived signed link for one of the
// request's files, so <img src> works without the bucket ever being public.

import { NextRequest, NextResponse } from 'next/server';
import { canSeeItem, getItem, getWishlistViewer, signedFileUrl } from '@/lib/wishlist/items';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getWishlistViewer();
  if (!viewer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await params;
  const path = req.nextUrl.searchParams.get('path') ?? '';
  const item = /^[0-9a-f-]{36}$/i.test(id) ? await getItem(id) : null;
  if (!item || !canSeeItem(viewer, item) || !item.files.includes(path)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const url = await signedFileUrl(path);
  if (!url) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const res = NextResponse.redirect(url, 302);
  res.headers.set('Cache-Control', 'private, max-age=240');
  return res;
}
