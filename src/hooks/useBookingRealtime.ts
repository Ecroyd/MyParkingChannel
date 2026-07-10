'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BOOKINGS_CHANGED_EVENT } from '@/lib/bookings/operational-state'

/**
 * Tenant-scoped Supabase Realtime subscription for booking operational updates.
 * Triggers a bookings-changed event so KPIs and lists refresh without polling.
 */
export function useBookingRealtime(tenantId: string | undefined, onChange?: () => void) {
  useEffect(() => {
    if (!tenantId) return

    const supabase = createClient()
    const channel = supabase
      .channel(`bookings-ops-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          window.dispatchEvent(new CustomEvent(BOOKINGS_CHANGED_EVENT))
          onChange?.()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenantId, onChange])
}
