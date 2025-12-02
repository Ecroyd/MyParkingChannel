/**
 * Seed default channels for a new tenant
 * Called when a tenant is created
 */
import { SupabaseClient } from '@supabase/supabase-js';

export async function seedDefaultChannels(
  supabase: SupabaseClient,
  tenantId: string
): Promise<void> {
  const defaultChannels = [
    {
      code: 'all',
      name: 'All channels',
      description: 'Fallback pricing used when no specific channel match is found.',
      kind: 'system',
      is_default: true,
      is_active: true,
      sort_order: 10,
    },
    {
      code: 'direct',
      name: 'Direct',
      description: 'Phone bookings, walk-ins, and admin-entered bookings.',
      kind: 'direct',
      is_default: false,
      is_active: true,
      sort_order: 20,
    },
    {
      code: 'web',
      name: 'Web',
      description: 'Your own website / online checkout.',
      kind: 'web',
      is_default: false,
      is_active: true,
      sort_order: 30,
    },
    {
      code: 'agent',
      name: 'Agent',
      description: 'Default channel for agent/partner bookings when no specific channel is set.',
      kind: 'agent',
      is_default: false,
      is_active: true,
      sort_order: 40,
    },
  ];

  const { error } = await supabase
    .from('tenant_channels')
    .insert(
      defaultChannels.map((ch) => ({
        tenant_id: tenantId,
        ...ch,
      }))
    );

  if (error) {
    console.error('Error seeding default channels:', error);
    throw error;
  }
}

