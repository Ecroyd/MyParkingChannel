import { cookies } from 'next/headers';
import { createServerClient as createSSRServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export async function getServerSupabase(options?: { admin?: boolean }) {
  if (options?.admin) {
    return supabaseAdmin();
  }
  
  const cookieStore = await cookies();
  return createSSRServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (key) => cookieStore.get(key)?.value,
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
  return getServerSupabase(options);
}

export function createAdminClient() {
  return supabaseAdmin();
}