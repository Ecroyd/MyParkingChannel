import { createAdminClient } from '@/lib/supabase/server';

/**
 * Upsert a health snapshot row for cron/scheduler. Service role so RLS is bypassed.
 * UI can read via anon key with RLS (admin/owner only).
 */
export async function writeHealthStatus(
  tenantId: string | null,
  key: 'canary' | 'cavu' | 'email_parse' | 'email_ingest',
  payload: Record<string, unknown>
): Promise<void> {
  const supabase = createAdminClient();
  const row = {
    tenant_id: tenantId,
    key,
    payload,
    updated_at: new Date().toISOString(),
  };

  // Update existing or insert. (An upsert on tenant_id,key failed in production with 42P10:
  // the live table has no unique constraint matching it, so per-tenant health never saved.)
  let lookup = supabase.from('system_health_status').select('id').eq('key', key);
  lookup = tenantId === null ? lookup.is('tenant_id', null) : lookup.eq('tenant_id', tenantId);
  const { data: existing } = await lookup.limit(1).maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('system_health_status')
      .update({ payload, updated_at: row.updated_at })
      .eq('id', existing.id);
    if (error) console.error('[HEALTH WRITE]', key, tenantId, error);
  } else {
    const { error } = await supabase.from('system_health_status').insert(row);
    if (error) console.error('[HEALTH WRITE]', key, error);
  }
}
