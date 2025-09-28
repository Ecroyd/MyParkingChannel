import { createServerClient as createSSRClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// One place to create a server-side client
export async function createServerClient(opts?: { admin?: boolean }) {
  const cookieStore = await cookies();
  
  if (opts?.admin) {
    // Admin client doesn't need cookies
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  // Regular client with cookie support
  return createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {}, // Server components can't set cookies
        remove: () => {}, // Server components can't remove cookies
      },
    }
  );
}

// Back-compat for older imports across the codebase
export async function getServerSupabase(opts?: { admin?: boolean }) {
  return await createServerClient(opts);
}
export async function supabaseAdmin() {
  return await createServerClient({ admin: true });
}
export async function createAdminClient() {
  return await createServerClient({ admin: true });
}