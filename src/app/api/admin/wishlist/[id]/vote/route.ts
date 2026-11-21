// PUT    /api/admin/wishlist/:id/vote — "Me too"
// DELETE /api/admin/wishlist/:id/vote — take it back
// Anyone who can see the request, except the person who posted it.

import { NextRequest, NextResponse } from 'next/server';
import { canSeeItem, getItem, getWishlistViewer, setVote, voteSummary } from '@/lib/wishlist/items';

export const runtime = 'nodejs';

async function vote(params: Promise<{ id: string }>, on: boolean) {
  const viewer = await getWishlistViewer();
  if (!viewer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await params;
  const item = /^[0-9a-f-]{36}$/i.test(id) ? await getItem(id) : null;
  if (!item || !canSeeItem(viewer, item)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (item.created_by === viewer.userId) {
    return NextResponse.json({ error: 'You posted this one, so it already counts as yours.' }, { status: 400 });
  }
  try {
    await setVote(id, viewer.userId, on);
    return NextResponse.json(await voteSummary(id, viewer.userId));
  } catch (err) {
    console.error('[wishlist] vote failed', err);
    return NextResponse.json({ error: 'Could not save' }, { status: 500 });
  }
}

export async function PUT(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return vote(params, true);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return vote(params, false);
}
