// src/lib/partners/auth.ts
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export interface PartnerAuthContext {
  tenantId: string;
  partnerName: string;
  scopes: string[];
}

export async function authenticatePartnerApiKey(
  headers: Headers
): Promise<PartnerAuthContext | null> {
  const apiKey = headers.get("x-api-key") || headers.get("X-API-Key");
  if (!apiKey) return null;

  const hash = crypto.createHash("sha256").update(apiKey).digest("hex");

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("partner_api_keys")
    .select("tenant_id, name, scopes, is_active")
    .eq("api_key_hash", hash)
    .maybeSingle();

  if (error || !data || !data.is_active) {
    return null;
  }

  // Fire-and-forget update of last_used_at (ignore errors)
  void supabase
    .from("partner_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("api_key_hash", hash);

  return {
    tenantId: data.tenant_id,
    partnerName: data.name,
    scopes: (data.scopes || []) as string[],
  };
}

