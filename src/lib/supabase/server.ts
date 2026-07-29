import { cookies } from 'next/headers';
import { createServerClient as createSSRServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { telemetryClientOptions } from './queryTelemetry';

export async function getServerSupabase() {
  const cookieStore = await cookies();
  return createSSRServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...telemetryClientOptions('server-ssr'),
      cookies: {
        get: (name: string) => {
          return cookieStore.get(name)?.value;
        },
        set: (name: string, value: string, options: any) => {
          // In Next.js 15, cookies can only be modified in Server Actions or Route Handlers.
          // In Server Components, we make this a no-op to avoid errors.
          // Token refresh will happen in Route Handlers/Server Actions where cookies can be set.
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // Silently ignore cookie setting errors in Server Components
            // This is expected behavior in Next.js 15
          }
        },
        remove: (name: string, options: any) => {
          // Same as set - no-op in Server Components
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // Silently ignore cookie removal errors in Server Components
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
    {
      auth: { persistSession: false },
      ...telemetryClientOptions('server-admin'),
    }
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