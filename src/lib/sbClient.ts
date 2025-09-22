import { createClient } from "@supabase/supabase-js";

export function sbFromRequestAuth(authorization?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, {
    global: { headers: authorization ? { Authorization: authorization } : {} },
  });
}


