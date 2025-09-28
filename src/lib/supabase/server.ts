import { createClient } from "@supabase/supabase-js";

// One place to create a server-side client
export function createServerClient(opts?: { admin?: boolean }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = opts?.admin
    ? process.env.SUPABASE_SERVICE_ROLE_KEY!
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: fetch as any },
  });
}

// Back-compat for older imports across the codebase
export function getServerSupabase(opts?: { admin?: boolean }) {
  return createServerClient(opts);
}
export function supabaseAdmin() {
  return createServerClient({ admin: true });
}
export function createAdminClient() {
  return createServerClient({ admin: true });
}