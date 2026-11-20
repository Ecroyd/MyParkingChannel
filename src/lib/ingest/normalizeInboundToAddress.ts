/**
 * Normalize Cloudflare Email Routing To: addresses so
 * BOOKINGS@MYPARKINGCHANNEL.APP matches tenant_inbound_inboxes.bookings@…
 */
export function normalizeInboundToAddress(
  toAddress: string | null | undefined
): string | null {
  if (!toAddress?.trim()) return null;
  return toAddress.trim().toLowerCase();
}
