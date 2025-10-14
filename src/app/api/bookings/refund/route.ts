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

    // Process refund using tenant's Stripe Connect account
    const refund = await createTenantRefund({
      tenantId,
      paymentIntentId,
      amount,
      reason
    });

    // Update booking to reflect refund
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        payment_status: 'refunded',
        money_received: false,
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
