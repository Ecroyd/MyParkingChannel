// src/lib/bookings/gateStatus.ts

export type GateStatus = 'reserved' | 'arrived' | 'departed';

export function getGateStatus(opts: {
  checked_in_at: string | null;
  checked_out_at: string | null;
}): GateStatus {
  if (opts.checked_out_at) return 'departed';
  if (opts.checked_in_at) return 'arrived';
  return 'reserved';
}

