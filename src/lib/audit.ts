/**
 * Audit logging utilities
 * Records important system events for compliance and debugging
 */

import { createAdminClient } from '@/lib/supabase/server-admin';
import { AUDIT_ACTIONS } from '@/lib/constants';

export interface AuditTarget {
  tenantId?: string;
  tenantName?: string;
  tenantSlug?: string;
  ownerEmail?: string;
  ownerUserId?: string;
  userId?: string;
  action?: string;
  [key: string]: any;
}

export interface AuditLogEntry {
  actorUserId: string | null;
  action: string;
  target: AuditTarget;
}

/**
 * Logs an audit event to the database
 * @param entry - The audit log entry to record
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    const adminClient = await createAdminClient();
    
    const { error } = await adminClient
      .from('audit_logs')
      .insert({
        actor_user_id: entry.actorUserId,
        action: entry.action,
        target: entry.target,
        created_at: new Date().toISOString(),
      });
    
    if (error) {
      console.error('Failed to log audit event:', error);
      throw error;
    }
    
    console.log('Audit event logged:', entry.action, entry.target);
  } catch (error) {
    console.error('Audit logging failed:', error);
    // Don't throw - audit failures shouldn't break the main flow
  }
}

/**
 * Convenience function to log tenant creation
 */
export async function logTenantCreated(tenantId: string, tenantName: string, tenantSlug: string, ownerEmail: string, ownerUserId: string): Promise<void> {
  await logAudit({
    actorUserId: null, // System action
    action: AUDIT_ACTIONS.TENANT_CREATED,
    target: {
      tenantId,
      tenantName,
      tenantSlug,
      ownerEmail,
      ownerUserId,
    },
  });
}

/**
 * Convenience function to log owner invitation
 */
export async function logOwnerInvited(tenantId: string, ownerEmail: string, ownerUserId: string): Promise<void> {
  await logAudit({
    actorUserId: null, // System action
    action: AUDIT_ACTIONS.OWNER_INVITED,
    target: {
      tenantId,
      ownerEmail,
      ownerUserId,
    },
  });
}

/**
 * Convenience function to log tenant updates
 */
export async function logTenantUpdated(tenantId: string, actorUserId: string, changes: Record<string, any>): Promise<void> {
  await logAudit({
    actorUserId,
    action: AUDIT_ACTIONS.TENANT_UPDATED,
    target: {
      tenantId,
      changes,
    },
  });
}

/**
 * Convenience function to log tenant deletion
 */
export async function logTenantDeleted(tenantId: string, tenantName: string, actorUserId: string): Promise<void> {
  await logAudit({
    actorUserId,
    action: AUDIT_ACTIONS.TENANT_DELETED,
    target: {
      tenantId,
      tenantName,
    },
  });
}
