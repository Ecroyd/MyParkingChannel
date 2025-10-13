import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export function getServerSupabase(options?: { admin?: boolean }) {
  if (options?.admin) {
    return supabaseAdmin();
  }
  
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // ✅ New compliant cookie helpers
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch (err) {
            console.warn("setAll cookie error:", err);
          }
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
  return getServerSupabase(options);
}

export function createAdminClient() {
  return supabaseAdmin();
}