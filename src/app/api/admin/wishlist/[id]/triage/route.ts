// PATCH /api/admin/wishlist/:id/triage  { status, reply } — platform admins only.
// A changed status or reply is emailed to the person who posted the request.

import { after, NextRequest, NextResponse } from 'next/server';
import { triageSchema } from '@/lib/wishlist/fields';
import { getItem, getWishlistViewer, notifyPoster, setTriage } from '@/lib/wishlist/items';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getWishlistViewer();
  if (!viewer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!viewer.isPlatformAdmin) return NextResponse.json({ error: 'Platform admin access required' }, { status: 403 });

  const { id } = await params;
  const item = /^[0-9a-f-]{36}$/i.test(id) ? await getItem(id) : null;
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = triageSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the form.' }, { status: 400 });

  try {
    await setTriage(item, parsed.data);
  } catch (err) {
    console.error('[wishlist] triage failed', err);
    return NextResponse.json({ error: 'Could not save' }, { status: 500 });
  }
  const origin = req.nextUrl.origin;
  after(() => notifyPoster(item, parsed.data, origin, viewer.userId));
  return NextResponse.json({ ok: true });
}
