import { NextRequest, NextResponse } from 'next/server';
import { format, subDays } from 'date-fns';
import { requireFinancialsAccess } from '@/lib/auth/requireFinancials';
import { createAdminClient } from '@/lib/supabase/server-admin';
import {
  parseFiltersFromSearchParams,
  type ReportingFilters,
} from '@/lib/analytics/reportingTypes';
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/datetime/parse';

export async function resolveTenantTimezone(tenantId: string): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('tenants')
    .select('timezone')
    .eq('id', tenantId)
    .maybeSingle();
  return data?.timezone || DEFAULT_TENANT_TIMEZONE;
}

export async function guardReportingRequest(
  req: NextRequest,
  bodyTenantId?: string | null
): Promise<
  | { ok: true; userId: string; tenantId: string; filters: ReportingFilters; timezone: string }
  | { ok: false; response: NextResponse }
> {
  const { searchParams } = new URL(req.url);
  const tenantId = bodyTenantId || searchParams.get('tenant_id');
  const guard = await requireFinancialsAccess(tenantId);
  if (!guard.ok) return guard;

  const timezone = await resolveTenantTimezone(guard.tenantId);

  // Ensure from/to defaults so Zod parse succeeds
  if (!searchParams.get('from') || !searchParams.get('to')) {
    const to = format(new Date(), 'yyyy-MM-dd');
    const from = format(subDays(new Date(), 29), 'yyyy-MM-dd');
    if (!searchParams.get('from')) searchParams.set('from', from);
    if (!searchParams.get('to')) searchParams.set('to', to);
  }

  try {
    const filters = parseFiltersFromSearchParams(searchParams, guard.tenantId);
    filters.timezone = timezone;
    return { ok: true, userId: guard.userId, tenantId: guard.tenantId, filters, timezone };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid filters';
    return { ok: false, response: NextResponse.json({ error: message }, { status: 400 }) };
  }
}

export function filtersFromBody(
  body: Record<string, unknown>,
  tenantId: string,
  timezone: string
): ReportingFilters {
  const params = new URLSearchParams();
  params.set('from', String(body.from ?? ''));
  params.set('to', String(body.to ?? ''));
  if (body.dateBasis) params.set('dateBasis', String(body.dateBasis));
  if (body.channel) params.set('channel', String(body.channel));
  if (body.status) params.set('status', String(body.status));
  if (body.stayMin != null) params.set('stayMin', String(body.stayMin));
  if (body.stayMax != null) params.set('stayMax', String(body.stayMax));
  if (body.leadMin != null) params.set('leadMin', String(body.leadMin));
  if (body.leadMax != null) params.set('leadMax', String(body.leadMax));

  if (!params.get('from') || !params.get('to')) {
    const to = format(new Date(), 'yyyy-MM-dd');
    const from = format(subDays(new Date(), 29), 'yyyy-MM-dd');
    if (!params.get('from')) params.set('from', from);
    if (!params.get('to')) params.set('to', to);
  }

  const filters = parseFiltersFromSearchParams(params, tenantId);
  filters.timezone = timezone;
  return filters;
}
