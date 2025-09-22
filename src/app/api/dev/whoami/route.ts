import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(req: NextRequest) {
  const res = new NextResponse()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => req.cookies.get(n)?.value,
        set: (n: string, v: string, o: any) => res.cookies.set({ name: n, value: v, ...o }),
        remove: (n: string, o: any) => res.cookies.set({ name: n, value: '', ...o }),
      },
    }
  )
  const { data: { user }, error } = await supabase.auth.getUser()
  return NextResponse.json({ user: user?.email ?? null, error: error?.message ?? null }, { headers: res.headers })
}

