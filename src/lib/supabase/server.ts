/**
 * Server-side Supabase client factory
 * Provides both authenticated (anon) and admin (service role) clients
 */

import { createServerClient as createSSRClient } from "@supabase/ssr";
import { createClient as createSbClient, SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { clientEnv, getServerEnv } from "@/lib/env";

type ClientOptions = { 
  admin?: boolean;
};

/**
 * Creates a server-side Supabase client
 * @param opts.admin - If true, returns admin client with service role (bypasses RLS)
 * @returns Supabase client configured for server-side usage
 */
export async function createServerClient(opts: ClientOptions = {}): Promise<SupabaseClient> {
  const url = clientEnv.NEXT_PUBLIC_SUPABASE_URL;
  
  if (opts.admin) {
    // Admin client with service role - bypasses RLS
    const { SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();
    return createSbClient(url, SUPABASE_SERVICE_ROLE_KEY, { 
      auth: { 
        persistSession: false, 
        autoRefreshToken: false 
      },
      db: {
        schema: 'public',
      },
    });
  }
  
  // Regular client with anon key - respects RLS
  const key = clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const store = await cookies();
  return createSSRClient(url, key, {
    cookies: {
      get: (name: string) => store.get(name)?.value,
      set: () => {},
      remove: () => {},
    },
  });
}

/**
 * Convenience function for creating admin client
 * @deprecated Use createAdminClient() from server-admin.ts instead
 */
export async function createAdminClient(): Promise<SupabaseClient> {
  return createServerClient({ admin: true });
}