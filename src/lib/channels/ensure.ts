/**
 * Helper to ensure a tenant channel exists (upsert-like behavior)
 * If channel exists, returns it; otherwise creates it
 */
import { SupabaseClient } from '@supabase/supabase-js';

export type EnsureChannelInput = {
  tenantId: string;
  code: string; // e.g. 'cavu', 'holiday_extras'
  name: string; // e.g. 'CAVU', 'Holiday Extras'
  description?: string;
  kind?: string; // e.g. 'agent'
  sort_order?: number;
};

export async function ensureTenantChannel(
  supabase: SupabaseClient,
  input: EnsureChannelInput
) {
  const {
    tenantId,
    code,
    name,
    description,
    kind = 'agent',
    sort_order = 100,
  } = input;

  // 1) Try to find existing channel
  const { data: existing, error: findError } = await supabase
    .from('tenant_channels')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('code', code.toLowerCase())
    .maybeSingle();

  if (findError && findError.code !== 'PGRST116') {
    // PGRST116 is 'Results contain 0 rows' in some Supabase configurations
    throw findError;
  }

  if (existing) {
    return existing;
  }

  // 2) Insert new channel
  const { data: inserted, error: insertError } = await supabase
    .from('tenant_channels')
    .insert({
      tenant_id: tenantId,
      code: code.toLowerCase(),
      name,
      description: description || `Channel for partner ${name} API bookings.`,
      kind,
      sort_order,
      is_active: true,
      is_default: false,
    })
    .select('*')
    .single();

  if (insertError || !inserted) {
    // If it's a unique constraint violation, try to fetch the existing one
    if (insertError?.code === '23505') {
      const { data: existingAfterRace, error: fetchError } = await supabase
        .from('tenant_channels')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('code', code.toLowerCase())
        .maybeSingle();

      if (existingAfterRace && !fetchError) {
        return existingAfterRace;
      }
    }
    throw insertError ?? new Error('Failed to insert tenant channel');
  }

  return inserted;
}

/**
 * Helper to derive channel code and name from partner name/code
 */
export function deriveChannelFromPartner(partnerNameOrCode: string): {
  code: string;
  name: string;
} {
  // Convert to lowercase for code
  const code = partnerNameOrCode.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  
  // Convert to title case for name
  const name = partnerNameOrCode
    .split(/[_\s-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');

  return { code, name };
}

