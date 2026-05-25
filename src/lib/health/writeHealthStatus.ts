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

  if (tenantId !== null) {
    const { error } = await supabase.from('system_health_status').upsert(row, {
      onConflict: 'tenant_id,key',
    });
    if (error) console.error('[HEALTH WRITE]', key, tenantId, error);
    return;
  }

  // Platform (tenant_id IS NULL): partial unique is on (key). Update existing or insert.
  const { data: existing } = await supabase
    .from('system_health_status')
    .select('id')
    .is('tenant_id', null)
    .eq('key', key)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('system_health_status')
      .update({ payload, updated_at: row.updated_at })
      .eq('id', existing.id);
    if (error) console.error('[HEALTH WRITE]', key, error);
  } else {
    const { error } = await supabase.from('system_health_status').insert(row);
    if (error) console.error('[HEALTH WRITE]', key, error);
  }
}
