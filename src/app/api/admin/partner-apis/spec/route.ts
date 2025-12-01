// app/api/admin/partner-apis/spec/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerSupabase } from '@/lib/supabase/server';
import PDFDocument from 'pdfkit';

// Ensure this runs in Node.js runtime (required for pdfkit)
export const runtime = 'nodejs';

function buildSpecMarkdown(opts: {
  baseUrl: string;
  partnerName: string;
  scopes: string[];
}): string {
  const { baseUrl, partnerName, scopes } = opts;

  const lines: string[] = [];

  lines.push(`# Parking Channel – Supplier API for ${partnerName}`);
  lines.push('');
  lines.push(
    `Base URL: \`${baseUrl}\``
  );
  lines.push('');
  lines.push(
    '> Authentication: Send your API key in the `X-API-Key` header with every request.'
  );
  lines.push('');
  lines.push('```http');
  lines.push('X-API-Key: <your-api-key>');
  lines.push('```');
  lines.push('');

  // PRODUCTS
  if (scopes.includes('products')) {
    lines.push('---');
    lines.push('');
    lines.push('## GET /products');
    lines.push('');
    lines.push(
      'Returns all active parking products for this supplier (car park).'
    );
    lines.push('');
    lines.push('**Request:**');
    lines.push('');
    lines.push('```http');
    lines.push('GET /api/supplier/v1/products HTTP/1.1');
    lines.push(`Host: ${new URL(baseUrl).host}`);
    lines.push('X-API-Key: <your-api-key>');
    lines.push('```');
    lines.push('');
    lines.push('**Response 200:**');
    lines.push('');
    lines.push('```json');
    lines.push(
      JSON.stringify(
        [
          {
            id: 'prod_123',
            code: 'FLYPARKS_STD',
            name: 'Standard Parking',
            description: 'Outdoor parking, 24/7 shuttle to terminal.',
            location: {
              airport_code: 'EXT',
              terminal: 'T1',
            },
            min_stay_hours: 24,
            max_stay_days: 30,
            lead_time_hours: 2,
            cancellation_policy: {
              free_until_hours_before: 24,
              fee_percentage_after: 100,
            },
            features: [
              'cctv',
              'fenced',
              'park_and_ride',
              'disabled_spaces',
            ],
            currency: 'GBP',
            status: 'active',
          },
        ],
        null,
        2
      )
    );
    lines.push('```');
    lines.push('');
  }

  // AVAILABILITY
  if (scopes.includes('availability')) {
    lines.push('---');
    lines.push('');
    lines.push('## GET /availability');
    lines.push('');
    lines.push(
      'Returns pricing and availability for a given product and date range.'
    );
    lines.push('');
    lines.push('**Request:**');
    lines.push('');
    lines.push('```http');
    lines.push(
      'GET /api/supplier/v1/availability?product_id=prod_123&start_at=2026-01-10T08:00:00Z&end_at=2026-01-15T18:00:00Z&currency=GBP&passengers=2 HTTP/1.1'
    );
    lines.push(`Host: ${new URL(baseUrl).host}`);
    lines.push('X-API-Key: <your-api-key>');
    lines.push('```');
    lines.push('');
    lines.push('**Response 200:**');
    lines.push('');
    lines.push('```json');
    lines.push(
      JSON.stringify(
        {
          product_id: 'prod_123',
          start_at: '2026-01-10T08:00:00Z',
          end_at: '2026-01-15T18:00:00Z',
          currency: 'GBP',
          availability_status: 'available',
          remaining_capacity: 42,
          pricing: {
            rate_plan: 'standard',
            days: 5,
            base_price: 59.99,
            surcharges: [
              {
                code: 'LATE_RETURN',
                description: 'Late return fee',
                amount: 5.0,
              },
            ],
            discounts: [
              {
                code: 'ONLINE10',
                description: 'Online booking discount',
                amount: -3.0,
              },
            ],
            total_price: 61.99,
          },
        },
        null,
        2
      )
    );
    lines.push('```');
    lines.push('');
  }

  // BOOKINGS
  if (scopes.includes('bookings')) {
    lines.push('---');
    lines.push('');
    lines.push('## POST /bookings');
    lines.push('');
    lines.push('Creates a booking in Parking Channel for the given stay.');
    lines.push('');
    lines.push('**Request:**');
    lines.push('');
    lines.push('```http');
    lines.push('POST /api/supplier/v1/bookings HTTP/1.1');
    lines.push(`Host: ${new URL(baseUrl).host}`);
    lines.push('Content-Type: application/json');
    lines.push('X-API-Key: <your-api-key>');
    lines.push('```');
    lines.push('');
    lines.push('```json');
    lines.push(
      JSON.stringify(
        {
          external_reference: 'CAVU-ABC123',
          product_id: 'prod_123',
          start_at: '2026-01-10T08:00:00Z',
          end_at: '2026-01-15T18:00:00Z',
          customer: {
            first_name: 'James',
            last_name: 'Ecroyd',
            email: 'james@example.com',
            phone: '+447700900123',
          },
          vehicle: {
            plate: 'AB12CDE',
            make: 'Audi',
            model: 'Q5',
            colour: 'Black',
          },
          flight: {
            departure_number: 'BA123',
            arrival_number: 'BA456',
          },
          price: {
            currency: 'GBP',
            total: 61.99,
          },
        },
        null,
        2
      )
    );
    lines.push('```');
    lines.push('');
    lines.push('**Response 201:**');
    lines.push('');
    lines.push('```json');
    lines.push(
      JSON.stringify(
        {
          reference: 'MPC-2026-000123',
          status: 'confirmed',
          source: partnerName.toLowerCase(),
          created_at: '2026-01-01T12:00:00Z',
        },
        null,
        2
      )
    );
    lines.push('```');
    lines.push('');

    // GET /bookings/{reference}
    lines.push('---');
    lines.push('');
    lines.push('## GET /bookings/{reference}');
    lines.push('');
    lines.push(
      'Retrieves details of a specific booking by its reference. Only bookings for your tenant are accessible.'
    );
    lines.push('');
    lines.push('**Request:**');
    lines.push('');
    lines.push('```http');
    lines.push('GET /api/supplier/v1/bookings/MPC-2026-000123 HTTP/1.1');
    lines.push(`Host: ${new URL(baseUrl).host}`);
    lines.push('X-API-Key: <your-api-key>');
    lines.push('```');
    lines.push('');
    lines.push('**Response 200:**');
    lines.push('');
    lines.push('```json');
    lines.push(
      JSON.stringify(
        {
          reference: 'MPC-2026-000123',
          status: 'confirmed',
          start_at: '2026-01-10T08:00:00Z',
          end_at: '2026-01-15T18:00:00Z',
          customer: {
            name: 'James Ecroyd',
            email: 'james@example.com',
            phone: '+447700900123',
          },
          vehicle: {
            plate: 'AB12CDE',
            make: 'Audi',
            model: 'Q5',
            colour: 'Black',
          },
          flight_number: 'BA123',
          notes: 'Source: CAVU',
          checked_in_at: null,
          checked_out_at: null,
          created_at: '2026-01-01T12:00:00Z',
        },
        null,
        2
      )
    );
    lines.push('```');
    lines.push('');

    // PATCH /bookings/{reference}
    lines.push('---');
    lines.push('');
    lines.push('## PATCH /bookings/{reference}');
    lines.push('');
    lines.push(
      'Amends an existing booking. You can update dates, customer details, vehicle details, flight number, and notes.'
    );
    lines.push('');
    lines.push('**Important constraints:**');
    lines.push('');
    lines.push('- Bookings that have already checked in (`checked_in_at` is not null) cannot be amended.');
    lines.push('- Bookings with status `cancelled` or `no_show` cannot be amended.');
    lines.push('- When changing dates, the new dates must have available capacity (availability is recalculated excluding this booking).');
    lines.push('- Only the following fields can be updated: `start_at`, `end_at`, `customer_name`, `customer_email`, `customer_phone`, `plate`, `car_make`, `car_model`, `car_color`, `flight_number`, `notes`.');
    lines.push('');
    lines.push('**Request:**');
    lines.push('');
    lines.push('```http');
    lines.push('PATCH /api/supplier/v1/bookings/MPC-2026-000123 HTTP/1.1');
    lines.push(`Host: ${new URL(baseUrl).host}`);
    lines.push('Content-Type: application/json');
    lines.push('X-API-Key: <your-api-key>');
    lines.push('```');
    lines.push('');
    lines.push('```json');
    lines.push(
      JSON.stringify(
        {
          start_at: '2026-01-11T08:00:00Z',
          end_at: '2026-01-16T18:00:00Z',
          customer_email: 'james.newemail@example.com',
          plate: 'XY99ABC',
          flight_number: 'BA456',
        },
        null,
        2
      )
    );
    lines.push('```');
    lines.push('');
    lines.push('**Response 200:**');
    lines.push('');
    lines.push('```json');
    lines.push(
      JSON.stringify(
        {
          reference: 'MPC-2026-000123',
          status: 'confirmed',
          start_at: '2026-01-11T08:00:00Z',
          end_at: '2026-01-16T18:00:00Z',
          customer: {
            name: 'James Ecroyd',
            email: 'james.newemail@example.com',
            phone: '+447700900123',
          },
          vehicle: {
            plate: 'XY99ABC',
            make: 'Audi',
            model: 'Q5',
            colour: 'Black',
          },
          flight_number: 'BA456',
          notes: 'Source: CAVU',
          checked_in_at: null,
          checked_out_at: null,
        },
        null,
        2
      )
    );
    lines.push('```');
    lines.push('');
    lines.push('**Error 409 BOOKING_IN_PROGRESS:**');
    lines.push('');
    lines.push('Returned when attempting to amend a booking that has already checked in.');
    lines.push('');
    lines.push('```json');
    lines.push(
      JSON.stringify(
        {
          error: {
            code: 'BOOKING_IN_PROGRESS',
            message: 'Booking has already checked in and can no longer be amended.',
          },
        },
        null,
        2
      )
    );
    lines.push('```');
    lines.push('');
    lines.push('**Error 409 NO_AVAILABILITY:**');
    lines.push('');
    lines.push('Returned when attempting to change dates but the new dates are not available.');
    lines.push('');
    lines.push('```json');
    lines.push(
      JSON.stringify(
        {
          error: {
            code: 'NO_AVAILABILITY',
            message: 'The requested new dates are not available for this booking.',
          },
        },
        null,
        2
      )
    );
    lines.push('```');
    lines.push('');

    // POST /bookings/{reference}/cancel
    lines.push('---');
    lines.push('');
    lines.push('## POST /bookings/{reference}/cancel');
    lines.push('');
    lines.push(
      'Cancels an existing booking. The booking status is set to `cancelled` and a cancellation note is added.'
    );
    lines.push('');
    lines.push('**Important constraints:**');
    lines.push('');
    lines.push('- Bookings that have already checked in (`checked_in_at` is not null) cannot be cancelled.');
    lines.push('- If the booking is already cancelled, the request is idempotent and returns the current state.');
    lines.push('');
    lines.push('**Request:**');
    lines.push('');
    lines.push('```http');
    lines.push('POST /api/supplier/v1/bookings/MPC-2026-000123/cancel HTTP/1.1');
    lines.push(`Host: ${new URL(baseUrl).host}`);
    lines.push('X-API-Key: <your-api-key>');
    lines.push('```');
    lines.push('');
    lines.push('**Response 200:**');
    lines.push('');
    lines.push('```json');
    lines.push(
      JSON.stringify(
        {
          reference: 'MPC-2026-000123',
          status: 'cancelled',
          start_at: '2026-01-10T08:00:00Z',
          end_at: '2026-01-15T18:00:00Z',
          customer: {
            name: 'James Ecroyd',
            email: 'james@example.com',
            phone: '+447700900123',
          },
          vehicle: {
            plate: 'AB12CDE',
            make: 'Audi',
            model: 'Q5',
            colour: 'Black',
          },
          flight_number: 'BA123',
          notes: 'Source: CAVU\nCancelled via supplier API (CAVU)',
          checked_in_at: null,
          checked_out_at: null,
        },
        null,
        2
      )
    );
    lines.push('```');
    lines.push('');
    lines.push('**Error 409 BOOKING_IN_PROGRESS:**');
    lines.push('');
    lines.push('Returned when attempting to cancel a booking that has already checked in.');
    lines.push('');
    lines.push('```json');
    lines.push(
      JSON.stringify(
        {
          error: {
            code: 'BOOKING_IN_PROGRESS',
            message: 'Booking has already checked in and can no longer be cancelled.',
          },
        },
        null,
        2
      )
    );
    lines.push('```');
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('### Errors');
  lines.push('');
  lines.push('All error responses use:');
  lines.push('');
  lines.push('```json');
  lines.push(
    JSON.stringify(
      {
        error: {
          code: 'INVALID_REQUEST',
          message: 'Description of the problem',
        },
      },
      null,
      2
    )
  );
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

async function markdownToPdfBuffer(markdown: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4',
      });

      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => {
        chunks.push(chunk as Buffer);
      });

      doc.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          resolve(buffer);
        } catch (err) {
          reject(err);
        }
      });

      doc.on('error', (err) => {
        reject(err);
      });

      // Very simple: write markdown as plain text line-by-line.
      const lines = markdown.split('\n');
      lines.forEach((line) => {
        try {
          doc.text(line || ' ', { paragraphGap: 4 });
        } catch (err) {
          // Skip problematic lines
          console.warn('Error adding line to PDF:', err);
        }
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export async function GET(req: NextRequest) {
  try {
    // Check authentication (don't redirect for file downloads)
    const supabase = await getServerSupabase();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('Spec route: Auth error', userError);
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }
    
    const { searchParams } = req.nextUrl;
    const keyId = searchParams.get('keyId');
    const format = searchParams.get('format') ?? 'md';
    
    console.log('Spec route: keyId=', keyId, 'format=', format);

    if (!keyId) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'keyId is required' } },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Get the partner key and verify user has access to its tenant
    const { data, error } = await adminClient
      .from('partner_api_keys')
      .select('id, name, scopes, tenant_id')
      .eq('id', keyId)
      .single();

    if (error || !data) {
      console.error('Spec route: Partner key not found', error);
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Partner key not found' } },
        { status: 404 }
      );
    }
    
    console.log('Spec route: Found partner key', data.name);

    // Verify user has access to this tenant
    const { data: userTenant } = await adminClient
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('tenant_id', data.tenant_id)
      .maybeSingle();

    if (!userTenant) {
      console.error('Spec route: User does not have access to tenant', data.tenant_id);
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Access denied to this partner key' } },
        { status: 403 }
      );
    }
    
    console.log('Spec route: User has access, generating spec');

    const baseUrl = `${req.nextUrl.origin}/api/supplier/v1`;

    const markdown = buildSpecMarkdown({
      baseUrl,
      partnerName: data.name,
      scopes: data.scopes ?? [],
    });

    const baseFilename = `parking-channel-supplier-api-${data.name
      .toLowerCase()
      .replace(/\s+/g, '-')}`;

    if (format === 'pdf') {
      try {
        console.log('Generating PDF for partner:', data.name);
        const pdfBuffer = await markdownToPdfBuffer(markdown);
        console.log('PDF generated, buffer size:', pdfBuffer.length);

        // Convert Buffer to Uint8Array for Response
        const uint8Array = new Uint8Array(pdfBuffer);

        return new Response(uint8Array, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${baseFilename}.pdf"`,
            'Content-Length': pdfBuffer.length.toString(),
          },
        });
      } catch (err: any) {
        console.error('Failed to generate PDF spec', err);
        console.error('Error details:', err?.message, err?.stack);
        return NextResponse.json(
          {
            error: {
              code: 'INTERNAL_ERROR',
              message: `Failed to generate PDF spec: ${err?.message || 'Unknown error'}`,
            },
          },
          { status: 500 }
        );
      }
    }

    // Default: markdown
    return new NextResponse(markdown, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${baseFilename}.md"`,
      },
    });
  } catch (err: any) {
    console.error('Spec generation error:', err);
    console.error('Error stack:', err?.stack);
    console.error('Error message:', err?.message);
    return NextResponse.json(
      { 
        error: { 
          code: 'INTERNAL_ERROR', 
          message: `Failed to generate spec: ${err?.message || 'Unknown error'}`,
          details: process.env.NODE_ENV === 'development' ? err?.stack : undefined
        } 
      },
      { status: 500 }
    );
  }
}

