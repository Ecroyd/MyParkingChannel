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
    const doc = new PDFDocument({
      margin: 50,
    });

    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => {
      chunks.push(chunk as Buffer);
    });

    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    doc.on('error', (err) => {
      reject(err);
    });

    // Very simple: write markdown as plain text line-by-line.
    const lines = markdown.split('\n');
    lines.forEach((line) => {
      doc.text(line, { paragraphGap: 4 });
    });

    doc.end();
  });
}

export async function GET(req: NextRequest) {
  try {
    // Check authentication (don't redirect for file downloads)
    const supabase = await getServerSupabase();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }
    
    const { searchParams } = req.nextUrl;
    const keyId = searchParams.get('keyId');
    const format = searchParams.get('format') ?? 'md';

    if (!keyId) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'keyId is required' } },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('partner_api_keys')
      .select('id, name, scopes')
      .eq('id', keyId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Partner key not found' } },
        { status: 404 }
      );
    }

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
        const pdfBuffer = await markdownToPdfBuffer(markdown);

        return new NextResponse(new Uint8Array(pdfBuffer), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${baseFilename}.pdf"`,
          },
        });
      } catch (err) {
        console.error('Failed to generate PDF spec', err);
        return NextResponse.json(
          {
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Failed to generate PDF spec',
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
    console.error('Spec generation error', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to generate spec' } },
      { status: 500 }
    );
  }
}

