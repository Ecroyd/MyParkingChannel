// src/lib/suppliers/alerting.ts
import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import crypto from 'crypto';

/**
 * Parse reference from error message
 * Example: "Upsert failed for PC88935337: invalid input" -> "PC88935337"
 */
export function parseReferenceFromError(error: string): string | null {
  const match = error.match(/Upsert failed for ([A-Z0-9]+):/i);
  return match ? match[1] : null;
}

/**
 * Normalize error message for hashing (remove variable parts like references, timestamps)
 */
export function normalizeError(error: string): string {
  // Remove references
  let normalized = error.replace(/Upsert failed for [A-Z0-9]+:/gi, 'Upsert failed for REF:');
  // Remove timestamps
  normalized = normalized.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.\d]*Z?/g, 'TIMESTAMP');
  // Remove UUIDs
  normalized = normalized.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'UUID');
  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

/**
 * Generate hash of normalized error
 */
export function hashError(error: string): string {
  const normalized = normalizeError(error);
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Generate fingerprint for alert deduplication
 * Format: ${supplier_code}|${refOrUnknown}|${hash(normalizedError)}
 * Special case: stale alerts use "stale|2h" (handled in cron route)
 */
export function generateFingerprint(
  supplierCode: string,
  error: string
): string {
  const ref = parseReferenceFromError(error) || 'unknown';
  const hash = hashError(error);
  return `${supplierCode}|${ref}|${hash}`;
}

/**
 * Create alert record in supplier_sync_alerts
 * Returns the alert if created, null if duplicate (insert failed)
 */
export async function createSyncAlert(params: {
  tenantId: string;
  supplierCode: string;
  runId: string | null;
  errors: string[];
  severity?: 'error' | 'warning';
}): Promise<{ id: string; fingerprint: string } | null> {
  const { tenantId, supplierCode, runId, errors, severity = 'error' } = params;
  
  if (errors.length === 0) {
    return null;
  }

  // Use first error for fingerprint and message
  const firstError = errors[0];
  const fingerprint = generateFingerprint(supplierCode, firstError);
  
  // Create message: first error or summary
  const message = errors.length === 1 
    ? firstError 
    : `${errors.length} errors, first: ${firstError.slice(0, 200)}`;

  const supabase = createAdminClient();
  
  const { data: alert, error: insertError } = await supabase
    .from('supplier_sync_alerts')
    .insert({
      tenant_id: tenantId,
      supplier_code: supplierCode,
      run_id: runId,
      fingerprint,
      severity,
      message,
      meta: {
        errors,
      },
    })
    .select('id, fingerprint')
    .single();

  // If insert failed due to unique constraint (duplicate), return null
  if (insertError) {
    if (insertError.code === '23505') { // Unique violation
      return null;
    }
    console.error('[ALERTING] Failed to create alert', insertError);
    return null;
  }

  return alert;
}

/**
 * Get enabled alert routes for a tenant
 */
export async function getAlertRoutes(tenantId: string) {
  const supabase = createAdminClient();
  
  const { data: routes, error } = await supabase
    .from('tenant_alert_routes')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_enabled', true);

  if (error) {
    console.error('[ALERTING] Failed to fetch alert routes', error);
    return [];
  }

  return routes || [];
}

/**
 * Mark alert as sent
 */
export async function markAlertSent(alertId: string) {
  const supabase = createAdminClient();
  
  await supabase
    .from('supplier_sync_alerts')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', alertId);
}
