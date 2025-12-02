import { cookies } from 'next/headers';
import { createServerClient as createSSRServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export async function getServerSupabase() {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  
  // Debug: log cookie names (not values for security)
  const cookieNames = allCookies.map(c => c.name);
  console.log('🍪 [SERVER SUPABASE] Available cookies:', cookieNames);
  console.log('🍪 [SERVER SUPABASE] Supabase auth cookies:', 
    cookieNames.filter(name => name.includes('sb-') || name.includes('supabase')));
  
  return createSSRServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => allCookies,
        set: (name: string, value: string, options: any) => {
          cookieStore.set(name, value, options);
        },
        remove: (name: string, options: any) => {
          cookieStore.set(name, '', { ...options, maxAge: 0 });
        },
      },
    }
  );
}

export function supabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Legacy exports for existing codebase compatibility
export async function createServerClient(options?: { admin?: boolean }) {
  if (options?.admin) {
    return supabaseAdmin();
  }
  return await getServerSupabase();
}

export function createAdminClient() {
  return supabaseAdmin();
}