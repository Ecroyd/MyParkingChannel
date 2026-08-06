import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireFinancialsAccess } from '@/lib/auth/requireFinancials';
import { createAdminClient } from '@/lib/supabase/server-admin';

const definitionSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  report_definition: z.record(z.string(), z.unknown()),
});

export async function GET(req: NextRequest) {
  try {
    const tenantId = new URL(req.url).searchParams.get('tenant_id');
    const guard = await requireFinancialsAccess(tenantId);
    if (!guard.ok) return guard.response;

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('tenant_saved_reports')
      .select('id, name, description, report_definition, created_by, created_at, updated_at')
      .eq('tenant_id', guard.tenantId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ reports: data ?? [] });
  } catch (error) {
    console.error('[analytics/reporting/saved-reports] GET', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id : null;
    const guard = await requireFinancialsAccess(tenantId);
    if (!guard.ok) return guard.response;

    const parsed = definitionSchema.parse(body);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('tenant_saved_reports')
      .insert({
        tenant_id: guard.tenantId,
        name: parsed.name,
        description: parsed.description ?? null,
        report_definition: parsed.report_definition,
        created_by: guard.userId,
      })
      .select('id, name, description, report_definition, created_by, created_at, updated_at')
      .single();

    if (error) throw error;
    return NextResponse.json({ report: data }, { status: 201 });
  } catch (error) {
    console.error('[analytics/reporting/saved-reports] POST', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id : null;
    const id = typeof body.id === 'string' ? body.id : null;
    const guard = await requireFinancialsAccess(tenantId);
    if (!guard.ok) return guard.response;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.name === 'string') updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.report_definition && typeof body.report_definition === 'object') {
      updates.report_definition = body.report_definition;
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('tenant_saved_reports')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', guard.tenantId)
      .select('id, name, description, report_definition, created_by, created_at, updated_at')
      .single();

    if (error) throw error;
    return NextResponse.json({ report: data });
  } catch (error) {
    console.error('[analytics/reporting/saved-reports] PATCH', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenant_id');
    const id = searchParams.get('id');
    const guard = await requireFinancialsAccess(tenantId);
    if (!guard.ok) return guard.response;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin
      .from('tenant_saved_reports')
      .delete()
      .eq('id', id)
      .eq('tenant_id', guard.tenantId);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[analytics/reporting/saved-reports] DELETE', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
