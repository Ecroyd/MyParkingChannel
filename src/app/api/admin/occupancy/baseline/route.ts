import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import {
  isAuthoritativeOnSite,
  isDepartedButMarkedOnSite,
  isKeyRequiredNotArrived,
  isMissingArrivalDespiteOnSite,
  isOpenButCancelledOrNoShow,
  type OccupancyBookingRow,
} from '@/lib/analytics/occupancyTimeseries';
import { z } from 'zod';

const BOOKING_SELECT =
  'id, reference, plate, customer_name, status, gate_status, ops_status, anpr_status, ops_hidden, ops_hidden_reason, external_status, arrived_at, departed_at, checked_in_at, checked_out_at, start_at, end_at';

async function requireAdmin(tenantId: string, userId: string) {
  const admin = createAdminClient();
  const { data: membership } = await admin
    .from('user_tenants')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!membership || (membership.role !== 'admin' && membership.role !== 'owner')) {
    return null;
  }
  return membership;
}

async function resolveTenantId(userId: string, tenantParam: string | null) {
  const admin = createAdminClient();
  const { data: userTenants } = await admin
    .from('user_tenants')
    .select('tenant_id, role, is_default')
    .eq('user_id', userId);
  if (!userTenants?.length) return null;
  const tenantId = tenantParam ?? (userTenants.find((t) => t.is_default) ?? userTenants[0]).tenant_id;
  if (!userTenants.some((t) => t.tenant_id === tenantId)) return null;
  return tenantId;
}

function mapBooking(b: OccupancyBookingRow) {
  return {
    id: b.id,
    reference: b.reference,
    gate_status: b.gate_status,
    status: b.status,
    anpr_status: b.anpr_status,
    arrived_at: b.arrived_at,
    departed_at: b.departed_at,
    checked_in_at: b.checked_in_at,
    checked_out_at: b.checked_out_at,
  };
}

/** Preview disputed records before confirming a baseline. */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const tenantParam = new URL(req.url).searchParams.get('tenant_id');
    const tenantId = await resolveTenantId(user.id, tenantParam);
    if (!tenantId) {
      return NextResponse.json({ error: 'No tenant access' }, { status: 403 });
    }
    if (!(await requireAdmin(tenantId, user.id))) {
      return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
    }

    const admin = createAdminClient();
    // Broad candidate pull for classification — resolver filters the proposed count.
    const { data: bookings, error } = await admin
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('tenant_id', tenantId)
      .or(
        [
          'gate_status.in.(arrived,arrived_key_taken,take_key)',
          'anpr_status.eq.on_site',
          'status.eq.checked_in',
          'and(arrived_at.not.is.null,departed_at.is.null)',
          'and(checked_in_at.not.is.null,checked_out_at.is.null)',
          'departed_at.not.is.null',
          'checked_out_at.not.is.null',
        ].join(',')
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const rows = (bookings ?? []) as OccupancyBookingRow[];
    const validOnSite = rows.filter(isAuthoritativeOnSite);
    const missingArrival = rows.filter(isMissingArrivalDespiteOnSite);
    const openCancelled = rows.filter(isOpenButCancelledOrNoShow);
    const keyRequired = rows.filter(isKeyRequiredNotArrived);
    const departedInconsistent = rows.filter(isDepartedButMarkedOnSite);

    const { data: settings } = await admin
      .from('tenant_settings')
      .select('occupancy_events_reliable_from')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const { data: latestSnapshot } = await admin
      .from('tenant_occupancy_snapshots')
      .select('snapshot_at, occupied_count, source, data_quality, created_at')
      .eq('tenant_id', tenantId)
      .order('snapshot_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      tenantId,
      proposedCount: validOnSite.length,
      excludedCancelledOrNoShow: openCancelled.length,
      disputedMissingArrival: missingArrival.map(mapBooking),
      keyRequiredNotArrived: keyRequired.map(mapBooking),
      departedButMarkedOnSite: departedInconsistent.map(mapBooking),
      openCancelledOrNoShow: openCancelled.map(mapBooking),
      validOnSiteSample: validOnSite.slice(0, 20).map((b) => ({
        id: b.id,
        reference: b.reference,
      })),
      reliableFrom: settings?.occupancy_events_reliable_from ?? null,
      latestSnapshot: latestSnapshot ?? null,
      message:
        departedInconsistent.length > 0
          ? `Resolve ${departedInconsistent.length} departed-but-still-on-site state inconsistency before confirming.`
          : keyRequired.length > 0
            ? `${keyRequired.length} take_key booking(s) are key-required (not parked) and are excluded from the baseline.`
            : 'Cancelled/no-show open rows are excluded. Proposed count is authoritative physical occupancy.',
    });
  } catch (err) {
    console.error('[occupancy/baseline GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const postSchema = z.object({
  tenantId: z.string().uuid().optional(),
  occupiedCount: z.number().int().min(0),
  reviewedMissingArrivalIds: z.array(z.string().uuid()).default([]),
  reviewedDepartedInconsistencyIds: z.array(z.string().uuid()).default([]),
  confirmDisputedReview: z.literal(true),
  note: z.string().max(500).optional(),
});

/** Confirm and write a verified occupancy baseline. */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = postSchema.parse(await req.json());
    const tenantId = await resolveTenantId(user.id, body.tenantId ?? null);
    if (!tenantId) {
      return NextResponse.json({ error: 'No tenant access' }, { status: 403 });
    }
    if (!(await requireAdmin(tenantId, user.id))) {
      return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: bookings, error } = await admin
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('tenant_id', tenantId)
      .or(
        [
          'gate_status.in.(arrived,arrived_key_taken,take_key)',
          'anpr_status.eq.on_site',
          'status.eq.checked_in',
          'departed_at.not.is.null',
          'checked_out_at.not.is.null',
        ].join(',')
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const rows = (bookings ?? []) as OccupancyBookingRow[];
    const missingArrival = rows.filter(isMissingArrivalDespiteOnSite);
    const departedInconsistent = rows.filter(isDepartedButMarkedOnSite);
    const missingIds = new Set(missingArrival.map((b) => b.id).filter(Boolean) as string[]);
    const departedIds = new Set(departedInconsistent.map((b) => b.id).filter(Boolean) as string[]);
    const reviewedMissing = new Set(body.reviewedMissingArrivalIds);
    const reviewedDeparted = new Set(body.reviewedDepartedInconsistencyIds);

    if (missingIds.size > 0) {
      for (const id of missingIds) {
        if (!reviewedMissing.has(id)) {
          return NextResponse.json(
            {
              error:
                'All disputed on-site bookings missing arrival timestamps must be reviewed before confirming the baseline.',
              missingArrivalIds: Array.from(missingIds),
            },
            { status: 400 }
          );
        }
      }
    }

    if (departedIds.size > 0) {
      for (const id of departedIds) {
        if (!reviewedDeparted.has(id)) {
          return NextResponse.json(
            {
              error:
                'All departed-but-still-on-site inconsistencies must be reviewed (and preferably corrected) before confirming the baseline.',
              departedButMarkedOnSiteIds: Array.from(departedIds),
            },
            { status: 400 }
          );
        }
      }
    }

    const validCount = rows.filter(isAuthoritativeOnSite).length;
    if (body.occupiedCount !== validCount) {
      return NextResponse.json(
        {
          error: `occupiedCount must equal the authoritative on-site count (${validCount}). take_key, cancelled/no-show, and departed rows are excluded.`,
          proposedCount: validCount,
        },
        { status: 400 }
      );
    }

    const snapshotAt = new Date().toISOString();
    const dataQuality = [
      missingArrival.length ? `reviewed_missing_arrival=${missingArrival.length}` : null,
      departedInconsistent.length
        ? `reviewed_departed_inconsistency=${departedInconsistent.length}`
        : null,
    ]
      .filter(Boolean)
      .join(',') || 'clean';

    const { error: snapError } = await admin.from('tenant_occupancy_snapshots').upsert(
      {
        tenant_id: tenantId,
        snapshot_at: snapshotAt,
        occupied_count: body.occupiedCount,
        source: 'admin_confirmed',
        created_by: user.id,
        data_quality: dataQuality,
        metadata: {
          note: body.note ?? null,
          reviewedMissingArrivalIds: body.reviewedMissingArrivalIds,
          reviewedDepartedInconsistencyIds: body.reviewedDepartedInconsistencyIds,
          excludedCancelledOrNoShow: rows.filter(isOpenButCancelledOrNoShow).length,
          keyRequiredNotArrived: rows.filter(isKeyRequiredNotArrived).length,
        },
      },
      { onConflict: 'tenant_id,snapshot_at' }
    );

    if (snapError) {
      return NextResponse.json({ error: snapError.message }, { status: 400 });
    }

    const { data: existingSettings } = await admin
      .from('tenant_settings')
      .select('tenant_id')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (existingSettings) {
      await admin
        .from('tenant_settings')
        .update({ occupancy_events_reliable_from: snapshotAt })
        .eq('tenant_id', tenantId);
    } else {
      await admin.from('tenant_settings').insert({
        tenant_id: tenantId,
        occupancy_events_reliable_from: snapshotAt,
      });
    }

    await admin.from('audit_logs').insert({
      actor_user_id: user.id,
      action: 'occupancy_baseline_set',
      entity: 'tenant',
      entity_id: tenantId,
      metadata: {
        snapshotAt,
        occupiedCount: body.occupiedCount,
        dataQuality,
      },
      created_at: snapshotAt,
    });

    return NextResponse.json({
      ok: true,
      snapshotAt,
      occupiedCount: body.occupiedCount,
      reliableFrom: snapshotAt,
    });
  } catch (err) {
    console.error('[occupancy/baseline POST]', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
