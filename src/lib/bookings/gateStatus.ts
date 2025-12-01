// src/lib/bookings/gateStatus.ts

export type GateStatus = 'reserved' | 'arrived' | 'departed' | 'cancelled';

export function getGateStatus(opts: {
  checked_in_at: string | null;
  checked_out_at: string | null;
  status?: string | null;
}): GateStatus {
  // Priority 1: If checked_out_at is populated, they've departed
  if (opts.checked_out_at) {
    return 'departed';
  }
  
  // Priority 2: If checked_in_at is populated (and checked_out_at is not), they've arrived
  if (opts.checked_in_at) {
    return 'arrived';
  }
  
  // Priority 3: If neither timestamp is populated, check the status column
  // Return 'cancelled' if status is 'cancelled', otherwise 'reserved'
  if (opts.status === 'cancelled') {
    return 'cancelled';
  }
  
  return 'reserved';
}

