// src/lib/tenantSecrets/holidayExtras.ts
import { supabaseAdmin } from "@/lib/supabase/server";

export type HolidayExtrasEnv = "sandbox" | "live";

export interface HolidayExtrasConfig {
  apiKey: string;
  abtaNumber: string;
  password?: string;
  initials?: string;
  environment: HolidayExtrasEnv;
  system: string; // 'ABC' UK, 'ABG' EU
  lang: string;   // 'en', 'de', etc.
}

// Simple decryption helper (matches pattern from cron files)
function decryptSecret(encryptedValue: string): string {
  // TODO: Implement proper decryption using ENCRYPTION_KEY
  // For now, using base64 decode (matches existing pattern)
  return Buffer.from(encryptedValue, 'base64').toString();
}

export async function getHolidayExtrasConfig(
  tenantId: string
): Promise<HolidayExtrasConfig | null> {
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("tenant_secrets")
    .select("scope, key, value, value_ciphertext")
    .eq("tenant_id", tenantId)
    .eq("scope", "holiday_extras");

  if (error || !data || data.length === 0) return null;

  let apiKey: string | null = null;
  let abtaNumber: string | null = null;
  let password: string | undefined;
  let initials: string | undefined;
  let environment: HolidayExtrasEnv = "sandbox";
  let system = "ABC";
  let lang = "en";

  for (const row of data) {
    switch (row.key) {
      case "api_key":
        if (row.value_ciphertext) apiKey = decryptSecret(row.value_ciphertext);
        break;
      case "abta_number":
        if (row.value_ciphertext) abtaNumber = decryptSecret(row.value_ciphertext);
        break;
      case "password":
        if (row.value_ciphertext) password = decryptSecret(row.value_ciphertext);
        break;
      case "initials":
        if (row.value) initials = row.value;
        break;
      case "environment":
        if (row.value === "live" || row.value === "sandbox") {
          environment = row.value;
        }
        break;
      case "system":
        if (row.value) system = row.value;
        break;
      case "lang":
        if (row.value) lang = row.value;
        break;
    }
  }

  if (!apiKey || !abtaNumber) return null;

  return {
    apiKey,
    abtaNumber,
    password,
    initials,
    environment,
    system,
    lang,
  };
}

