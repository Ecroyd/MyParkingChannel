import { createClient } from "@supabase/supabase-js";

export function createServerClientDirect(opts?: { admin?: boolean }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = opts?.admin ? process.env.SUPABASE_SERVICE_ROLE_KEY! : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (!url || !key) {
    throw new Error("Supabase env missing: check NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
