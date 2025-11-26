"use server";

import { supabaseAdmin } from "@/lib/supabase/server";

// Simple encryption helper (matches pattern from cron files)
function encryptSecret(value: string): string {
  // TODO: Implement proper encryption using ENCRYPTION_KEY
  // For now, using base64 encode (matches existing pattern)
  return Buffer.from(value).toString('base64');
}

export async function saveHolidayExtrasSettings(formData: FormData) {
  const tenantId = formData.get("tenantId") as string;
  const apiKey = formData.get("apiKey") as string;
  const abtaNumber = formData.get("abtaNumber") as string;
  const password = formData.get("password") as string;
  const initials = formData.get("initials") as string;
  const environment = formData.get("environment") as string;
  const system = formData.get("system") as string;
  const lang = formData.get("lang") as string;

  if (!tenantId) throw new Error("Missing tenantId");
  if (!apiKey) throw new Error("API Key is required");
  if (!abtaNumber) throw new Error("ABTA Number is required");

  const supa = supabaseAdmin();

  // Store encrypted secrets (with value_ciphertext)
  const encryptedSecrets = [
    {
      tenant_id: tenantId,
      scope: "holiday_extras",
      key: "api_key",
      value_ciphertext: encryptSecret(apiKey),
      updated_at: new Date().toISOString(),
    },
    {
      tenant_id: tenantId,
      scope: "holiday_extras",
      key: "abta_number",
      value_ciphertext: encryptSecret(abtaNumber),
      updated_at: new Date().toISOString(),
    },
  ];

  // Add optional password if provided
  if (password) {
    encryptedSecrets.push({
      tenant_id: tenantId,
      scope: "holiday_extras",
      key: "password",
      value_ciphertext: encryptSecret(password),
      updated_at: new Date().toISOString(),
    });
  }

  // Store plain text secrets (with value)
  const plainSecrets = [];
  
  if (initials) {
    plainSecrets.push({
      tenant_id: tenantId,
      scope: "holiday_extras",
      key: "initials",
      value: initials,
      updated_at: new Date().toISOString(),
    });
  }

  // Environment, system, and lang are not sensitive, store as plain values
  plainSecrets.push(
    {
      tenant_id: tenantId,
      scope: "holiday_extras",
      key: "environment",
      value: environment || "sandbox",
      updated_at: new Date().toISOString(),
    },
    {
      tenant_id: tenantId,
      scope: "holiday_extras",
      key: "system",
      value: system || "ABC",
      updated_at: new Date().toISOString(),
    },
    {
      tenant_id: tenantId,
      scope: "holiday_extras",
      key: "lang",
      value: lang || "en",
      updated_at: new Date().toISOString(),
    }
  );

  // Upsert encrypted secrets
  for (const secret of encryptedSecrets) {
    // Try with scope first
    let { error } = await supa
      .from("tenant_secrets")
      .upsert(secret, { onConflict: "tenant_id,scope,key" });

    // If that fails, try without scope (fallback for different table structures)
    if (error) {
      const { error: error2 } = await supa
        .from("tenant_secrets")
        .upsert(
          {
            tenant_id: secret.tenant_id,
            key: secret.key,
            value_ciphertext: secret.value_ciphertext,
            updated_at: secret.updated_at,
          },
          { onConflict: "tenant_id,key" }
        );
      
      if (error2) {
        console.error(`Error saving secret ${secret.key}:`, error2);
        throw new Error(`Failed to save ${secret.key}: ${error2.message}`);
      }
    }
  }

  // Upsert plain text secrets
  for (const secret of plainSecrets) {
    // Try with scope first
    let { error } = await supa
      .from("tenant_secrets")
      .upsert(secret as any, { onConflict: "tenant_id,scope,key" });

    // If that fails, try without scope (fallback for different table structures)
    if (error) {
      const { error: error2 } = await supa
        .from("tenant_secrets")
        .upsert(
          {
            tenant_id: secret.tenant_id,
            key: secret.key,
            value: secret.value,
            updated_at: secret.updated_at,
          },
          { onConflict: "tenant_id,key" }
        );
      
      if (error2) {
        console.error(`Error saving secret ${secret.key}:`, error2);
        throw new Error(`Failed to save ${secret.key}: ${error2.message}`);
      }
    }
  }

  return { ok: true };
}

