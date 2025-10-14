// src/app/api/bookings/[id]/extend/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { quoteExtensionCents } from "@/lib/pricing/quoteExtension";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const supabase = await createServerClient(); // user-scoped (RLS enforced)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "UNAUTH" }, { status: 401 });

    const body = await req.json();
    const {
      tenantId,
      newEndAtISO,            // required
      overrideFlight,          // optional
      overridePickupAtISO,     // optional
      amountOverrideCents,     // optional
      paymentMethodId          // required for confirming card
    } = body;

    // 1) Load booking (RLS isolates by tenant)
    const { data: booking, error: bErr } = await supabase
      .from("bookings")
      .select("id, tenant_id, end_at, customer_email, reference")
      .eq("id", resolvedParams.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (bErr || !booking) return NextResponse.json({ ok: false, error: "BOOKING_NOT_FOUND" }, { status: 404 });

    // 2) Quote
    const quoteCents = await quoteExtensionCents({
      tenantId,
      bookingEndAtISO: booking.end_at,
      newEndAtISO,
    });
    const chargeCents = Number.isFinite(amountOverrideCents) && amountOverrideCents! > 0
      ? Math.round(amountOverrideCents!)
      : quoteCents;

    // 3) Fetch per-tenant Stripe keys (optional in development)
    const admin = createAdminClient();
    const { data: secrets } = await admin
      .from("tenant_secrets")
      .select("stripe_secret_key")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    
    const isDevelopment = process.env.NODE_ENV === 'development';
    const isDevTestPayment = paymentMethodId === "dev_test_payment_method";
    
    if (!secrets?.stripe_secret_key && !isDevTestPayment) {
      return NextResponse.json({ ok: false, error: "STRIPE_NOT_CONFIGURED" }, { status: 400 });
    }

    let stripe: Stripe | null = null;
    if (secrets?.stripe_secret_key) {
      stripe = new Stripe(secrets.stripe_secret_key, { apiVersion: "2025-08-27.basil" });
    }

    let intent: any = null;
    
    if (isDevTestPayment) {
      // Development mode - simulate successful payment
      intent = {
        id: `dev_pi_${Date.now()}`,
        status: "succeeded",
        amount: chargeCents,
        currency: "gbp"
      };
    } else if (stripe) {
      // 4) Create or reuse a customer (simple: by email)
      let customerId: string | undefined;
      if (booking.customer_email) {
        const customers = await stripe.customers.list({ email: booking.customer_email, limit: 1 });
        customerId = customers.data[0]?.id ?? (await stripe.customers.create({ 
          email: booking.customer_email, 
          metadata: { tenantId, bookingId: booking.id }
        })).id;
      }

      // 5) Create + confirm PaymentIntent
      intent = await stripe.paymentIntents.create({
        amount: chargeCents,
        currency: "gbp",
        customer: customerId,
        payment_method: paymentMethodId,
        confirm: true,
        automatic_payment_methods: { enabled: true },
        description: `Booking extension ${booking.reference ?? booking.id}`,
        metadata: {
          tenantId,
          bookingId: booking.id,
          newEndAtISO,
          quoteCents: String(quoteCents),
        },
      });
    }

    // 6) Write extension row (admin client to bypass RLS for fields like created_by)
    const { data: ext, error: extErr } = await admin
      .from("booking_extensions")
      .insert({
        tenant_id: tenantId,
        booking_id: booking.id,
        prev_end_at: booking.end_at,
        new_end_at: newEndAtISO,
        quote_amount_cents: quoteCents,
        charged_amount_cents: chargeCents,
        override_flight: overrideFlight || null,
        override_pickup_at: overridePickupAtISO || null,
        stripe_payment_intent_id: intent.id,
        stripe_payment_status: intent.status,
        created_by: user.id,
        note: 'Extension via admin UI'
      })
      .select("*")
      .single();

    if (extErr) {
      return NextResponse.json({ ok: false, error: "EXTENSION_WRITE_FAILED", details: extErr }, { status: 500 });
    }

    // If succeeded, trigger already updated the booking. Return fresh booking id for UI refresh.
    return NextResponse.json({ ok: true, intentStatus: intent.status, extension: ext });
  } catch (e: any) {
    console.error("Extension error:", e);
    return NextResponse.json({ ok: false, error: e.message ?? "ERROR" }, { status: 500 });
  }
}
