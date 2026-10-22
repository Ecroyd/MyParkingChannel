import { createAdminClient } from '@/lib/supabase/server-admin';

/**
 * Server-only store for checkout form data between Stripe Checkout creation and the
 * checkout.session.completed webhook. Replaces the public /api/bookings/temp-store
 * HTTP route, which let anyone read or overwrite these rows.
 */

export type TempBookingInput = {
  tenantId: string;
  reference: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  plate?: string | null;
  flightNumber?: string | null;
  startAt: string;
  endAt: string;
  amount: number;
};

export type TempBookingData = {
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  plate: string | null;
  flightNumber: string | null;
  startAt: string | null;
  endAt: string | null;
  amount: number | null;
};

const TTL_MS = 60 * 60 * 1000;

export async function storeTempBooking(input: TempBookingInput): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const { error } = await admin.from('temp_booking_data').upsert(
    {
      id: `${input.tenantId}_${input.reference}`,
      tenant_id: input.tenantId,
      reference: input.reference,
      customer_name: input.customerName ?? null,
      customer_email: input.customerEmail ?? null,
      customer_phone: input.customerPhone ?? null,
      plate: input.plate ?? null,
      flight_number: input.flightNumber ?? null,
      start_at: input.startAt,
      end_at: input.endAt,
      amount: input.amount,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + TTL_MS).toISOString(),
    },
    { onConflict: 'id' }
  );
  if (error) return { ok: false, error: error.message };

  // Housekeeping only. Rows are no longer deleted at the 1h expiry because Stripe can
  // retry a webhook for days; keep them for a week.
  await admin
    .from('temp_booking_data')
    .delete()
    .lt('expires_at', new Date(Date.now() - 7 * 24 * TTL_MS).toISOString());

  return { ok: true };
}

export async function getTempBooking(tenantId: string, reference: string): Promise<TempBookingData | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('temp_booking_data')
    .select('customer_name, customer_email, customer_phone, plate, flight_number, start_at, end_at, amount')
    .eq('id', `${tenantId}_${reference}`)
    .maybeSingle();
  if (error) throw new Error(`temp_booking_data lookup failed: ${error.message}`);
  if (!data) return null;
  return {
    customerName: data.customer_name ?? null,
    customerEmail: data.customer_email ?? null,
    customerPhone: data.customer_phone ?? null,
    plate: data.plate ?? null,
    flightNumber: data.flight_number ?? null,
    startAt: data.start_at ?? null,
    endAt: data.end_at ?? null,
    amount: data.amount ?? null,
  };
}
