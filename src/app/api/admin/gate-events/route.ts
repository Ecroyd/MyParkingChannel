import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthorizedAnprAdmin } from '@/lib/anpr/adminAnprAuth';
import {
  enforceAnprPageSize,
  resolveAnprEventTimeBounds,
} from '@/lib/anpr/adminAnprEventsParams';
import {
  ADMIN_ANPR_EVENTS_LIST_SELECT,
  ADMIN_GATE_EVENTS_LIST_SELECT,
  assertAnprListSelectSafe,
} from '@/lib/anpr/adminAnprEventsSelect';
import { withQueryTelemetryContext } from '@/lib/supabase/queryTelemetry';

export async function GET(req: NextRequest) {
  return withQueryTelemetryContext(
    { route: '/api/admin/gate-events', queryName: 'admin.anpr.events' },
    async () => {
      try {
        // Ignore browser tenant_id for authorisation — resolve on server
        const preferred = new URL(req.url).searchParams.get('tenantId');
        const auth = await resolveAuthorizedAnprAdmin(preferred);
        if (!auth.ok) {
          return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const { tenantId, adminClient } = auth.ctx;
        const { searchParams } = new URL(req.url);
        const limit = enforceAnprPageSize(searchParams.get('limit'));
        const { fromIso, toIso } = resolveAnprEventTimeBounds({
          from: searchParams.get('from'),
          to: searchParams.get('to'),
        });

        assertAnprListSelectSafe(ADMIN_GATE_EVENTS_LIST_SELECT);
        assertAnprListSelectSafe(ADMIN_ANPR_EVENTS_LIST_SELECT);

        let gateEventsQuery = adminClient
          .from('gate_events')
          .select(ADMIN_GATE_EVENTS_LIST_SELECT)
          .eq('tenant_id', tenantId)
          .gte('event_at', fromIso)
          .order('event_at', { ascending: false })
          .limit(limit);

        if (toIso) {
          gateEventsQuery = gateEventsQuery.lte('event_at', toIso);
        }

        let anprEventsQuery = adminClient
          .from('anpr_events')
          .select(ADMIN_ANPR_EVENTS_LIST_SELECT)
          .eq('tenant_id', tenantId)
          .gte('event_at', fromIso)
          .order('event_at', { ascending: false })
          .limit(limit);

        if (toIso) {
          anprEventsQuery = anprEventsQuery.lte('event_at', toIso);
        }

        const [gateRes, anprRes] = await Promise.all([gateEventsQuery, anprEventsQuery]);

        if (gateRes.error) {
          console.error('Error fetching gate events:', gateRes.error);
        }
        if (anprRes.error) {
          console.error('Error fetching anpr events:', anprRes.error);
        }

        const transformedGateEvents = ((gateRes.data || []) as unknown as Record<string, unknown>[]).map((event) => {
          const device = Array.isArray(event.gate_devices)
            ? event.gate_devices[0]
            : event.gate_devices;
          const booking = Array.isArray(event.bookings) ? event.bookings[0] : event.bookings;
          const deviceObj = device as { name?: string } | null;
          const bookingObj = booking as { reference?: string; status?: string } | null;

          return {
            id: event.id,
            event_at: event.event_at,
            mode: event.mode ?? event.direction ?? 'anpr',
            direction: event.direction ?? null,
            plate: event.plate,
            plate_norm: event.plate_norm ?? null,
            qr_code: event.qr_code,
            result: event.result,
            reason: event.reason,
            confidence: event.confidence ?? null,
            lane: event.lane ?? null,
            camera_id: event.camera_id ?? null,
            booking_id: event.booking_id ?? null,
            source: event.source ?? 'gate',
            processed_at: event.processed_at ?? null,
            device_name: deviceObj?.name || 'Unknown',
            booking_reference: bookingObj?.reference || null,
            booking_status: bookingObj?.status || null,
          };
        });

        const transformedAnprEvents = ((anprRes.data || []) as unknown as Record<string, unknown>[]).map((event) => {
          const booking = Array.isArray(event.bookings) ? event.bookings[0] : event.bookings;
          const bookingObj = booking as { reference?: string; status?: string } | null;

          let result = 'deny';
          if (event.status === 'matched' || event.status === 'corrected') result = 'allow';
          else if (event.status === 'unmatched') result = 'deny';

          let mode = 'anpr';
          if (event.direction === 'in') mode = 'entry';
          else if (event.direction === 'out') mode = 'exit';

          return {
            id: event.id,
            event_at: event.event_at,
            mode,
            direction: event.direction ?? null,
            plate: event.plate_raw,
            plate_norm: event.plate_normalized ?? null,
            qr_code: null,
            result,
            reason:
              event.status === 'unmatched'
                ? 'No booking match'
                : event.status === 'matched'
                  ? 'Matched to booking'
                  : String(event.status ?? ''),
            confidence: event.confidence ?? null,
            lane: null,
            camera_id: event.camera_id ?? null,
            booking_id: event.booking_id ?? null,
            source: 'anpr',
            processed_at: null,
            device_name: event.camera_id ? `Camera ${event.camera_id}` : 'ANPR Camera',
            booking_reference: bookingObj?.reference || null,
            booking_status: bookingObj?.status || null,
          };
        });

        const events = [...transformedGateEvents, ...transformedAnprEvents]
          .sort(
            (a, b) =>
              new Date(String(b.event_at)).getTime() - new Date(String(a.event_at)).getTime()
          )
          .slice(0, limit);

        return NextResponse.json({
          events,
          pageSize: limit,
          from: fromIso,
          to: toIso,
          tenantId,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        console.error('Gate events API error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }
  );
}
