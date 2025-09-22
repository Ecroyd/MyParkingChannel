import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function analyticsFinance({ start, end, tz }: { start: string; end: string; tz: string }) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: (name: string, value: string, options: any) => {
          // server component: cookie refresh is optional; we still wire set/remove for completeness
          cookieStore.set({ name, value, ...options })
        },
        remove: (name: string, options: any) => {
          cookieStore.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data, error } = await supabase.rpc('analytics_finance', {
    start_date: start,
    end_date: end,
    tz,
  })
  if (error) throw new Error(error.message)
  return data ?? []
}

