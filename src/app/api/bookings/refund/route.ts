import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { createTenantRefund } from '@/lib/stripe/tenant-payments';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { bookingId, tenantId, paymentIntentId, amount, reason } = body;

    if (!bookingId || !tenantId || !paymentIntentId || !amount) {
      return NextResponse.json({ 
        error: 'Missing required parameters: bookingId, tenantId, paymentIntentId, amount' 
      }, { status: 400 });
    }

    // Verify user has access to this tenant
    const { data: userTenant, error: accessError } = await supabase
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .single();

    if (accessError || !userTenant) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Verify booking exists and belongs to tenant
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, tenant_id, stripe_payment_intent_id, money_charged')
      .eq('id', bookingId)
      .eq('tenant_id', tenantId)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (booking.stripe_payment_intent_id !== paymentIntentId) {
      return NextResponse.json({ error: 'Payment intent mismatch' }, { status: 400 });
    }

    // amount is in pence (see BookingDetailsModal); money_charged is in pounds
    const amountPence = Number(amount);
    const chargedPence = Math.round(Number(booking.money_charged || 0) * 100);
    if (!Number.isInteger(amountPence) || amountPence <= 0 || (chargedPence > 0 && amountPence > chargedPence)) {
      return NextResponse.json({ error: 'Refund amount must be between 1 and the amount charged (in pence)' }, { status: 400 });
    }

    // Process refund using tenant's Stripe Connect account
    const refund = await createTenantRefund({
      tenantId,
      paymentIntentId,
      amount: amountPence,
      reason,
      // Same booking + amount within a minute = a double click, not a second refund.
      idempotencyKey: `refund:${bookingId}:${amountPence}:${Math.floor(Date.now() / 60000)}`,
    });

    // Record the refund on the booking. (bookings has no payment_status column, so the old
    // update always failed silently; append to notes so staff can see it.)
    const { data: current } = await supabase
      .from('bookings')
      .select('notes')
      .eq('id', bookingId)
      .maybeSingle();
    const refundNote = `Refunded £${(amountPence / 100).toFixed(2)} via Stripe (${refund.id}) on ${new Date().toISOString().slice(0, 10)}`;
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        notes: [current?.notes, refundNote].filter(Boolean).join('\n'),
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId);

    if (updateError) {
      console.error('Error updating booking after refund:', updateError);
      // Don't fail the request since refund was successful
    }

    return NextResponse.json({ 
      success: true, 
      refund: {
        id: refund.id,
        amount: refund.amount,
        status: refund.status
      }
    });

  } catch (error: any) {
    console.error('Refund error:', error);
    return NextResponse.json({ 
      error: error.message || 'Refund failed' 
    }, { status: 500 });
  }
}
