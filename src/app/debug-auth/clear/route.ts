import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  try {
    const cookieStore = await cookies();
    
    // Clear all Supabase auth cookies
    const authCookies = [
      'sb-access-token',
      'sb-refresh-token', 
      'supabase-auth-token',
      'supabase.auth.token'
    ];
    
    const response = NextResponse.json({ 
      success: true, 
      message: 'Auth cookies cleared. Please refresh your browser.' 
    });
    
    // Clear each auth cookie
    authCookies.forEach(cookieName => {
      response.cookies.set(cookieName, '', {
        expires: new Date(0),
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
    });
    
    return response;
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to clear auth state' 
    }, { status: 500 });
  }
}
