// lib/supplier/apiDocs.ts

export type SupplierEndpointDoc = {
  key: 'products' | 'availability' | 'bookings';
  name: string;
  method: 'GET' | 'POST';
  path: string;
  scope: 'products' | 'availability' | 'bookings';
  description: string;
  requestExample?: unknown;
  responseExample: unknown;
};

export const supplierApiDocs: SupplierEndpointDoc[] = [
  {
    key: 'products',
    name: 'List products',
    method: 'GET',
    path: '/api/supplier/v1/products',
    scope: 'products',
    description:
      'Returns the list of parking products for this tenant. Partners typically cache this and refresh periodically.',
    requestExample: undefined,
    responseExample: {
      products: [
        {
          id: 'default-tenant-id',
          code: 'DEFAULT_tenant-id',
          name: 'Car Park',
          description: 'Standard airport parking',
          airport_code: null,
          type: 'park_and_ride',
          currency: 'GBP',
          min_stay_days: 1,
          max_stay_days: 60,
          tags: ['default'],
        },
      ],
    },
  },
  {
    key: 'availability',
    name: 'Pricing & availability',
    method: 'GET',
    path: '/api/supplier/v1/availability',
    scope: 'availability',
    description:
      'Returns availability and pricing for a given product + date range. This covers both "pricing" and "availability" in CAVU\'s wording.',
    requestExample: {
      product_code: 'DEFAULT_tenant-id',
      arrival: '2026-01-10T08:00:00Z',
      departure: '2026-01-15T18:00:00Z',
      _note: 'GET request - these are query parameters in the URL',
    },
    responseExample: {
      product_code: 'DEFAULT_tenant-id',
      arrival: '2026-01-10T08:00:00Z',
      departure: '2026-01-15T18:00:00Z',
      available: true,
      currency: 'GBP',
      total_price: 40.0,
      breakdown: {
        base_price: 40.0,
        surcharges: 0,
        nights: 5,
      },
      max_spaces_available: 999,
    },
  },
  {
    key: 'bookings',
    name: 'Create booking',
    method: 'POST',
    path: '/api/supplier/v1/bookings',
    scope: 'bookings',
    description:
      'Creates a booking in our system for the given tenant. We respond with our internal reference and status.',
    requestExample: {
      product_code: 'DEFAULT_tenant-id',
      partner_booking_ref: 'CAVU-ABC123',
      arrival: '2026-01-10T08:00:00Z',
      departure: '2026-01-15T18:00:00Z',
      vehicle: {
        registration: 'AB12CDE',
        make: 'Audi',
        model: 'Q5',
        colour: 'Black',
      },
      customer: {
        title: 'Mr',
        first_name: 'James',
        last_name: 'Ecroyd',
        email: 'james@example.com',
        mobile: '+447700900123',
      },
      price: {
        currency: 'GBP',
        total: 40.0,
      },
      flight_number: 'BA123',
    },
    responseExample: {
      status: 'confirmed',
      booking_id: 'uuid-here',
      reference: 'CAVU-ABC123',
    },
  },
];

