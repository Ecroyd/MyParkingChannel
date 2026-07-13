import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const response = NextResponse.json({
      success: true,
      message: 'Auth cookies cleared. Please refresh your browser.',
    });

    // Clear known legacy names plus any current sb-*-auth-token cookies from @supabase/ssr
    const names = new Set(
      cookieStore.getAll().map((c) => c.name).filter((name) =>
        name.startsWith('sb-') ||
        name.includes('supabase') ||
        name === 'sb-access-token' ||
        name === 'sb-refresh-token'
      )
    );

    for (const cookieName of names) {
      response.cookies.set(cookieName, '', {
        expires: new Date(0),
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
      response.cookies.set(cookieName, '', {
        expires: new Date(0),
        path: '/',
        maxAge: 0,
        sameSite: 'lax',
      });
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to clear auth state',
      },
      { status: 500 }
    );
  }
}
