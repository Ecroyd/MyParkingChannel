export const runtime = 'nodejs';
import { NextResponse } from 'next/server';

export async function GET() {
  // This header asks the browser to clear caches/storage for this origin.
  // Only expose while debugging.
  if (process.env.NEXT_PUBLIC_DEBUG_SITE !== '1') {
    return new NextResponse('Not Found', { status: 404 });
  }
  return new NextResponse(
    JSON.stringify({ ok: true }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // You can remove 'cookies' once done if you want to keep sessions.
        "Clear-Site-Data": '"cache", "storage", "executionContexts"'
      }
    }
  );
}
