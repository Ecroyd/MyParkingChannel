// src/app/api/supplier/v1/bookings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { authenticatePartnerApiKey } from "@/lib/partners/auth";
import { createAdminClient } from "@/lib/supabase/admin";

interface BookingPayload {
  product_code: string;
  partner_booking_ref: string;
  arrival: string;   // ISO string
  departure: string; // ISO string
  vehicle?: {
    registration?: string;
    make?: string;
    model?: string;
    colour?: string;
  };
  customer: {
    title?: string;
    first_name?: string;
    last_name?: string;
    email: string;
    mobile?: string;
  };
  pax?: number;
  price: {
    currency: string;
    total: number;
  };
  flight_number?: string;
}

export async function POST(req: NextRequest) {
  const auth = await authenticatePartnerApiKey(req.headers);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: BookingPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    product_code,
    partner_booking_ref,
    arrival,
    departure,
    vehicle,
    customer,
    pax,
    price,
    flight_number,
  } = body;

  if (!product_code || !partner_booking_ref || !arrival || !departure || !customer?.email) {
    return NextResponse.json(
      { error: "Missing required fields: product_code, partner_booking_ref, arrival, departure, customer.email" },
      { status: 400 }
    );
  }

  const startAt = new Date(arrival);
  const endAt = new Date(departure);
  if (isNaN(startAt.getTime()) || isNaN(endAt.getTime()) || startAt >= endAt) {
    return NextResponse.json({ error: "Invalid arrival/departure times" }, { status: 400 });
  }

  const customerName = `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || "Unknown";
  const dedupeKey = `cavu:${partner_booking_ref}`;

  const supabase = createAdminClient();

  // Check dedupe first to avoid duplicate inserts on retries
  const { data: existing, error: existingError } = await supabase
    .from("bookings")
    .select("id, reference")
    .eq("tenant_id", auth.tenantId)
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();

  if (existingError) {
    console.error("CAVU booking dedupe check error:", existingError);
    return NextResponse.json({ error: "Internal error (dedupe)" }, { status: 500 });
  }

  if (existing) {
    // Already have this booking, return id + reference
    return NextResponse.json({
      status: "already_exists",
      booking_id: existing.id,
      reference: existing.reference,
    });
  }

  const insertPayload = {
    tenant_id: auth.tenantId,
    reference: partner_booking_ref,           // visible ref in your UI
    customer_name: customerName,
    customer_email: customer.email,
    customer_phone: customer.mobile || null,
    plate: vehicle?.registration || "UNKNOWN",
    car_make: vehicle?.make || null,
    car_model: vehicle?.model || null,
    car_color: vehicle?.colour || null,
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    status: "reserved",                       // booking_status enum
    money_charged: price?.total ?? 0,
    money_received: 0,                        // set when you reconcile with CAVU
    notes: `Imported from CAVU product ${product_code}`,
    source: "cavu",                           // booking_source enum
    flight_number: flight_number || null,
    dedupe_key: dedupeKey,
    is_incomplete: false,
    missing_fields: [],
    direction: "arrival"                      // your CHECK constraint allows 'arrival'/'departure'
  };

  const { data: inserted, error: insertError } = await supabase
    .from("bookings")
    .insert(insertPayload)
    .select("id, reference")
    .single();

  if (insertError) {
    console.error("CAVU booking insert error:", insertError);
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
  }

  return NextResponse.json({
    status: "confirmed",
    booking_id: inserted.id,
    reference: inserted.reference,
  });
}

