// src/lib/supabase/server-admin.ts
import { createClient } from '@supabase/supabase-js';

/**
 * Creates a secure Supabase admin client using service role
 * Only used for provisioning + admin logic
 * Excludes all cookies/auth for security
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  
  return createClient(url, key, {
    auth: { 
      autoRefreshToken: false, 
      persistSession: false 
    },
    global: { 
      headers: { 
        'X-Client-Info': 'pc-admin',
        'X-Service-Role': 'true'
      } 
    },
  });
}