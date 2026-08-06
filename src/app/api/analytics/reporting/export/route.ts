import { NextRequest, NextResponse } from 'next/server';
import { requireFinancialsAccess } from '@/lib/auth/requireFinancials';
import {
  filtersFromBody,
  resolveTenantTimezone,
} from '@/lib/analytics/reportingApi';
import {
  generateReportingCsv,
  type ExportPreset,
} from '@/lib/analytics/reportingExport';
import {
  ANONYMISED_EXPORT_FIELDS,
  ALL_EXPORT_FIELDS,
  EXPORT_PRESETS,
  PII_EXPORT_FIELDS,
} from '@/lib/analytics/reportingTypes';

export async function GET() {
  return NextResponse.json({
    presets: EXPORT_PRESETS,
    anonymisedFields: ANONYMISED_EXPORT_FIELDS,
    piiFields: PII_EXPORT_FIELDS,
    allFields: ALL_EXPORT_FIELDS,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id : null;
    const guard = await requireFinancialsAccess(tenantId);
    if (!guard.ok) return guard.response;

    const timezone = await resolveTenantTimezone(guard.tenantId);
    const filters = filtersFromBody(body, guard.tenantId, timezone);

    const preset = (String(body.preset || 'standard') as ExportPreset);
    if (!['standard', 'finance', 'anonymised', 'custom'].includes(preset)) {
      return NextResponse.json({ error: 'Invalid preset' }, { status: 400 });
    }

    const customFields = Array.isArray(body.fields)
      ? body.fields.map((f) => String(f))
      : undefined;

    const { csv, fields, includesPii, rowCount } = await generateReportingCsv({
      filters,
      preset,
      customFields,
      actorUserId: guard.userId,
    });

    const filename = `reporting-${preset}-${filters.from}_${filters.to}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Export-Fields': fields.join(','),
        'X-Export-Pii': includesPii ? '1' : '0',
        'X-Export-Rows': String(rowCount),
      },
    });
  } catch (error) {
    console.error('[analytics/reporting/export]', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
