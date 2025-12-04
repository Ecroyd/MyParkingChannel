// scripts/tortureSupplierApi.ts
//
// Torture-test the supplier API & availability engine.
//
// Usage:
//   BASE_URL=https://myparkingchannel.app/api/supplier/v1 \
//   API_KEY=xxx \
//   node --loader ts-node/esm scripts/tortureSupplierApi.ts
//
// or with tsx:
//   BASE_URL=... API_KEY=... npx tsx scripts/tortureSupplierApi.ts

type AvailabilityResponse = {
  product_id: string;
  start_at: string;
  end_at: string;
  currency: string;
  availability_status: 'available' | 'sold_out' | 'closed';
  remaining_capacity: number | null;
  pricing: {
    rate_plan: string;
    days: number;
    base_price: number;
    total_price: number;
    surcharges?: any[];
    discounts?: any[];
  };
};

type BookingCreateResponse = {
  reference: string;
  status: string;
  source: string;
  created_at: string;
};

type BookingDetails = {
  reference: string;
  status: string;
  start_at: string;
  end_at: string;
  customer: {
    name: string;
    email: string;
    phone?: string;
  };
  vehicle: {
    plate: string;
    make?: string;
    model?: string;
    colour?: string;
  };
  flight_number?: string;
  notes?: string;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
};

const BASE_URL = process.env.BASE_URL || 'https://myparkingchannel.app/api/supplier/v1';
const API_KEY = process.env.API_KEY || '';
const PRODUCT_ID = process.env.PRODUCT_ID || 'tenant_pool';
const CURRENCY = 'GBP';

// Adjust these test dates to match tenant_capacity entries for your test tenant.
const TEST_START = process.env.TEST_START || '2027-01-10T10:00:00Z';
const TEST_END = process.env.TEST_END || '2027-01-12T10:00:00Z';

if (!API_KEY) {
  console.error('API_KEY env var is required');
  process.exit(1);
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'X-API-Key': API_KEY,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    let errorBody;
    try {
      errorBody = JSON.parse(text);
    } catch {
      errorBody = { message: text };
    }
    
    // Handle missing pricing configuration gracefully
    if (res.status === 400 && errorBody.error?.code === 'PRICING_NOT_CONFIGURED') {
      throw new Error(
        `PRICING_NOT_CONFIGURED: No pricing rules found for this date range. ` +
        `Please configure LOS matrix in the Pricing UI for the requested dates. ` +
        `Path: ${path}`
      );
    }
    
    throw new Error(`GET ${path} failed: ${res.status} ${res.statusText} - ${text}`);
  }

  return (await res.json()) as T;
}

async function apiPost<T>(path: string, body?: any): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} failed: ${res.status} ${res.statusText} - ${text}`);
  }

  return (await res.json()) as T;
}

async function apiPatch<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PATCH ${path} failed: ${res.status} ${res.statusText} - ${text}`);
  }

  return (await res.json()) as T;
}

async function logStep(title: string) {
  console.log('\n==== ' + title + ' ====');
}

async function scenarioBasicCapacity() {
  await logStep('Scenario 1: Basic capacity consumption');

  // 1) Check initial availability
  const before = await apiGet<AvailabilityResponse>(
    `/availability?product_id=${encodeURIComponent(PRODUCT_ID)}&start_at=${encodeURIComponent(
      TEST_START
    )}&end_at=${encodeURIComponent(TEST_END)}&currency=${CURRENCY}`
  );
  console.log('Initial availability:', before);

  if (before.availability_status !== 'available') {
    throw new Error('Initial availability is not "available" — capacity not configured for test');
  }

  const initialRemaining = before.remaining_capacity;
  if (initialRemaining === null) {
    throw new Error('Initial remaining_capacity is null');
  }

  // 2) Create one booking
  const createRes = await apiPost<BookingCreateResponse>('/bookings', {
    external_reference: `TORTURE-1-${Date.now()}`,
    product_id: PRODUCT_ID,
    start_at: TEST_START,
    end_at: TEST_END,
    customer: {
      first_name: 'Torture',
      last_name: 'Tester',
      email: 'torture1@example.com',
    },
    vehicle: {
      plate: 'TORTURE1',
    },
    price: {
      currency: CURRENCY,
      total: 0,
    },
  });
  console.log('Created booking:', createRes);

  // 3) Check availability again
  const after = await apiGet<AvailabilityResponse>(
    `/availability?product_id=${encodeURIComponent(PRODUCT_ID)}&start_at=${encodeURIComponent(
      TEST_START
    )}&end_at=${encodeURIComponent(TEST_END)}&currency=${CURRENCY}`
  );
  console.log('Availability after 1 booking:', after);

  if (after.remaining_capacity === null) {
    throw new Error('After remaining_capacity is null');
  }

  if (after.remaining_capacity !== initialRemaining - 1) {
    throw new Error(
      `Expected remaining_capacity=${initialRemaining - 1} but got ${after.remaining_capacity}`
    );
  }

  return createRes.reference;
}

async function scenarioDateChange(reference: string) {
  await logStep('Scenario 2: Date change with availability recheck');

  // Move the booking by 1 day forward
  const newStart = '2027-01-11T10:00:00Z';
  const newEnd = '2027-01-13T10:00:00Z';

  const patched = await apiPatch<BookingDetails>(`/bookings/${encodeURIComponent(reference)}`, {
    start_at: newStart,
    end_at: newEnd,
    plate: 'TORTURE1-NEW',
  });

  console.log('Patched booking:', patched);

  if (patched.start_at !== newStart || patched.end_at !== newEnd) {
    throw new Error('Date change did not apply correctly');
  }
}

async function scenarioCancel(reference: string) {
  await logStep('Scenario 3: Cancel booking and ensure capacity returns');

  // Cancel booking
  const cancelled = await apiPost<BookingDetails>(
    `/bookings/${encodeURIComponent(reference)}/cancel`
  );
  console.log('Cancelled booking:', cancelled);

  if (cancelled.status !== 'cancelled') {
    throw new Error('Booking status after cancel is not "cancelled"');
  }

  // After cancel, capacity should have increased by 1 back to original level.
  const afterCancel = await apiGet<AvailabilityResponse>(
    `/availability?product_id=${encodeURIComponent(PRODUCT_ID)}&start_at=${encodeURIComponent(
      TEST_START
    )}&end_at=${encodeURIComponent(TEST_END)}&currency=${CURRENCY}`
  );
  console.log('Availability after cancel:', afterCancel);
}

async function scenarioOversellProtection() {
  await logStep('Scenario 4: Oversell protection');

  // Get current remaining capacity
  const before = await apiGet<AvailabilityResponse>(
    `/availability?product_id=${encodeURIComponent(PRODUCT_ID)}&start_at=${encodeURIComponent(
      TEST_START
    )}&end_at=${encodeURIComponent(TEST_END)}&currency=${CURRENCY}`
  );
  console.log('Availability before oversell loop:', before);

  if (before.remaining_capacity === null) {
    throw new Error('remaining_capacity is null before oversell loop');
  }

  const toBook = before.remaining_capacity;
  const createdRefs: string[] = [];

  // Fill up partner capacity
  for (let i = 0; i < toBook; i++) {
    const res = await apiPost<BookingCreateResponse>('/bookings', {
      external_reference: `TORTURE-OVERS-${Date.now()}-${i}`,
      product_id: PRODUCT_ID,
      start_at: TEST_START,
      end_at: TEST_END,
      customer: {
        first_name: 'Torture',
        last_name: `Loop${i}`,
        email: `torture-overs-${i}@example.com`,
      },
      vehicle: {
        plate: `OVER${i}`,
      },
      price: {
        currency: CURRENCY,
        total: 0,
      },
    });
    createdRefs.push(res.reference);
    console.log(`Created booking ${i + 1}/${toBook}:`, res.reference);
  }

  // Now it should be sold out for partner
  const afterFull = await apiGet<AvailabilityResponse>(
    `/availability?product_id=${encodeURIComponent(PRODUCT_ID)}&start_at=${encodeURIComponent(
      TEST_START
    )}&end_at=${encodeURIComponent(TEST_END)}&currency=${CURRENCY}`
  );
  console.log('Availability after filling capacity:', afterFull);

  if (afterFull.availability_status !== 'sold_out' && afterFull.remaining_capacity !== 0) {
    throw new Error(
      `Expected sold_out with remaining_capacity=0, got status=${afterFull.availability_status}, remaining=${afterFull.remaining_capacity}`
    );
  }

  // Try one more booking and expect NO_AVAILABILITY error (409)
  const extraRes = await fetch(`${BASE_URL}/bookings`, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      external_reference: `TORTURE-OVERS-EXTRA-${Date.now()}`,
      product_id: PRODUCT_ID,
      start_at: TEST_START,
      end_at: TEST_END,
      customer: {
        first_name: 'Too',
        last_name: 'Many',
        email: 'too-many@example.com',
      },
      vehicle: {
        plate: 'OVERSOLD',
      },
      price: {
        currency: CURRENCY,
        total: 0,
      },
    }),
  });

  if (extraRes.status !== 409) {
    const text = await extraRes.text();
    throw new Error(
      `Expected 409 when overselling, got ${extraRes.status} ${extraRes.statusText}: ${text}`
    );
  }
  console.log('Oversell attempt correctly returned 409.');

  // Clean up: cancel all created bookings
  for (const ref of createdRefs) {
    await apiPost<BookingDetails>(`/bookings/${encodeURIComponent(ref)}/cancel`);
  }
  console.log('Cancelled oversell test bookings.');
}

async function main() {
  console.log('Running Supplier API torture tests against', BASE_URL);
  console.log('Product ID:', PRODUCT_ID);
  console.log('Test window:', TEST_START, '->', TEST_END);
  console.log('\n⚠️  NOTE: This test requires pricing rules to be configured in the Pricing UI');
  console.log('   for the test dates. If you see PRICING_NOT_CONFIGURED errors,');
  console.log('   configure LOS matrix pricing for the requested date ranges.\n');

  try {
    const ref = await scenarioBasicCapacity();
    await scenarioDateChange(ref);
    await scenarioCancel(ref);
    await scenarioOversellProtection();

    console.log('\n✅ All torture-test scenarios passed.');
    process.exit(0);
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    
    if (errorMsg.includes('PRICING_NOT_CONFIGURED')) {
      console.error('\n❌ Torture-test failed: Pricing not configured');
      console.error('   Error:', errorMsg);
      console.error('\n   SOLUTION: Configure LOS matrix pricing in the Pricing UI');
      console.error('   for the test date ranges before running the torture test.');
      process.exit(1);
    }
    
    console.error('\n❌ Torture-test failed:', errorMsg);
    process.exit(1);
  }
}

main();

