// app/api/payments/public-checkout/route.ts
import { NextResponse } from 'next/server';
import { stripe, useConnected, ROOT_URL } from '@/lib/stripe';
import { getServerSupabase, getTenantStripeAccountId } from '@/lib/supabase-server';
import { getQuoteCents } from '@/lib/pricing';
import { siteUrlForTenantSlug } from '@/lib/sites/domain';

/**
 * POST body:
 * {
 *   tenant_id: string,              // required for public bookings
 *   start_at: string, end_at: string, // ISO strings for new quote
 *   customer_name?: string,
 *   customer_email?: string,         // customer email for Stripe checkout
 *   customer_phone?: string,         // customer phone number
 *   plate?: string,                 // vehicle registration
 *   reference?: string,                 // optional, displayed in product name
 *   application_fee_cents?: number      // optional platform fee; default 0
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      tenant_id,
      start_at,
      end_at,
      customer_name,
      customer_email,
      customer_phone,
      plate,
      flight_number,
      reference,
      application_fee_cents = 0,
    } = body;

    // Comprehensive validation
    const validationErrors: string[] = []
    const fieldErrors: Record<string, string> = {}
    
    if (!tenant_id) {
      validationErrors.push('Tenant ID is required')
      fieldErrors.tenant_id = 'Tenant ID is required'
    }
    if (!start_at) {
      validationErrors.push('Arrival date and time is required')
      fieldErrors.start_at = 'Arrival date and time is required'
    }
    if (!end_at) {
      validationErrors.push('Departure date and time is required')
      fieldErrors.end_at = 'Departure date and time is required'
    }
    if (customer_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email)) {
      validationErrors.push('Valid email address is required')
      fieldErrors.customer_email = 'Valid email address is required'
    }
    if (customer_name && customer_name.trim().length < 2) {
      validationErrors.push('Full name must be at least 2 characters')
      fieldErrors.customer_name = 'Full name must be at least 2 characters'
    }
    if (plate && plate.trim().length < 2) {
      validationErrors.push('Vehicle registration must be at least 2 characters')
      fieldErrors.plate = 'Vehicle registration must be at least 2 characters'
    }
    
    if (validationErrors.length > 0) {
      return NextResponse.json({ 
        error: 'Validation failed', 
        details: validationErrors,
        field_errors: fieldErrors
      }, { status: 400 });
    }

    const { accountId } = await getTenantStripeAccountId(tenant_id);
    if (!accountId) return NextResponse.json({ error: 'Stripe not connected for this tenant' }, { status: 400 });

    // Use admin client to bypass RLS for public operations
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    // Get tenant slug for proper cancel URL
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('slug')
      .eq('id', tenant_id)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 400 });
    }

    // Get quote for the booking
    const q = await getQuoteCents(tenant_id, start_at, end_at);
    const amount_cents = q.amount_cents;
    const currency = q.currency;

    if (amount_cents <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });

    // Generate a unique reference for the booking
    const generateReference = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = '';
      for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };

    const bookingReference = reference || generateReference();
    const productName = `Parking (${bookingReference})`;
    const descName = customer_name ? `Customer: ${customer_name}` : undefined;

    // Store booking data temporarily before creating Stripe session
    const tempBookingResponse = await fetch(`${ROOT_URL}/api/bookings/temp-store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: tenant_id,
        reference: bookingReference,
        customerName: customer_name,
        customerEmail: customer_email,
        customerPhone: customer_phone,
        plate: plate,
        flightNumber: flight_number,
        startAt: start_at,
        endAt: end_at,
        amount: amount_cents / 100
      })
    });

    if (!tempBookingResponse.ok) {
      console.error('Failed to store temp booking data');
    }

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        customer_email: customer_email, // Pre-populate the email field
        line_items: [{
          price_data: {
            currency,
            unit_amount: amount_cents,
            product_data: { name: productName, description: descName },
          },
          quantity: 1,
        }],
        payment_intent_data: {
          application_fee_amount: Number(application_fee_cents) || 0,
          metadata: {
            tenant_id: tenant_id,
            booking_reference: reference ?? '',
            customer_name: customer_name || '',
            customer_email: customer_email || '',
            customer_phone: customer_phone || '',
            plate: plate || '',
            start_at: start_at,
            end_at: end_at,
          },
        },
        success_url: `${ROOT_URL}/success?tenant=${tenant_id}&reference=${bookingReference}&amount=${amount_cents / 100}`,
        cancel_url: `${siteUrlForTenantSlug(tenant.slug)}?cancelled=1`,
      },
      useConnected(accountId),
    );

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('Public checkout error:', error);
    
    // Handle specific Stripe errors
    if (error.type === 'StripeInvalidRequestError') {
      if (error.code === 'email_invalid') {
        return NextResponse.json({ 
          error: 'Invalid email address. Please check your email format.' 
        }, { status: 400 });
      }
    }
    
    return NextResponse.json({ 
      error: error.message || 'Failed to create checkout session' 
    }, { status: 500 });
  }
}

