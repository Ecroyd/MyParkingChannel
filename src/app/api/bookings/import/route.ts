import { NextResponse } from "next/server";
import { withReq } from "@/lib/logger";
import { createServerClient } from '@/lib/supabase/server';
import { log } from "@/lib/logger";

// Resolve tenant ID from request (header, form, or user's default tenant)
async function resolveTenantId(req: Request, supabase: any) {
  const fromHeader = req.headers.get('x-tenant-id');
  if (fromHeader) return fromHeader;

  // if multipart/form-data, we'll read it later; here try cookie session:
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('NO_USER_SESSION');

  // Try the user's default tenant
  const { data: ut } = await supabase
    .from('user_tenants')
    .select('tenant_id, is_default')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .limit(1)
    .single();

  if (ut?.tenant_id) return ut.tenant_id;
  throw new Error('NO_TENANT_CONTEXT');
}

// Parse dates preferring UK (dd/mm/yyyy), with fallbacks
const parseDateSmart = (raw: string) => {
  if (!raw) return null;
  const s = raw.trim();

  // Excel serial (days since 1899-12-30)
  if (/^\d{4,5}$/.test(s)) {
    const n = Number(s);
    if (!Number.isNaN(n)) {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      const ms = epoch.getTime() + n * 86400000;
      return new Date(ms);
    }
  }

  // UK style dd/mm/yyyy or d/m/yy
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m1) {
    const d = Number(m1[1]), mo = Number(m1[2]) - 1;
    const y = Number(m1[3].length === 2 ? (Number(m1[3]) + 2000) : m1[3]);
    const dt = new Date(Date.UTC(y, mo, d));
    return Number.isNaN(+dt) ? null : dt;
  }

  // Fallback: native Date (handles ISO & US mm/dd/yyyy)
  const dt = new Date(s);
  return Number.isNaN(+dt) ? null : dt;
};

const toIsoOrNull = (d: Date | null) => (d ? d.toISOString() : null);

// Tiny CSV parser (no deps)
const parseCSV = async (f: File) => {
  const text = await f.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(",").map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    // basic CSV (no quoted commas). If you need quotes, swap in Papaparse here.
    const cols = line.split(",").map(v => v.trim());
    const rec: Record<string,string> = {};
    headers.forEach((h,i) => rec[h] = cols[i] ?? "");
    return rec;
  });
  return { headers, rows };
};

export async function POST(req: Request) {
  const { id, log: slog, error } = withReq(req);
  try {
    const supabase = await createServerClient(); // use user session + RLS
    
    // Resolve tenant ID first
    let tenant_id: string;
    try {
      tenant_id = await resolveTenantId(req, supabase);
    } catch (e: any) {
      if (e.message === 'NO_USER_SESSION') {
        return NextResponse.json({ ok:false, reason:"NO_USER_SESSION" }, { status: 401 });
      }
      if (e.message === 'NO_TENANT_CONTEXT') {
        return NextResponse.json({ ok:false, reason:"NO_TENANT_CONTEXT" }, { status: 400 });
      }
      throw e;
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;

    slog("start", { hasFile: !!file, tenant_id });

    if (!file) return NextResponse.json({ ok:false, reason:"NO_FILE" }, { status: 400 });

    // Parse CSV
    const { headers, rows } = await parseCSV(file);
    slog("csv_headers", headers);
    slog("csv_rows_count", rows.length);
    slog("csv_sample_first_3", rows.slice(0,3));

    // Minimal header normalization – map your actual column names here
    // Adjust these mappings to your CSV headings ("Booking ID", "Vehicle Registration", etc.)
    const H = {
      bookingId: ["Booking ID","BookingID","Reference","Ref"],
      reg: ["Vehicle Registration","Reg","VRM","Plate"],
      start: ["Arrival Date","Start","Arrival","Start Date"],
      end: ["Departure Date","End","Departure","End Date"],
      name: ["Customer Name","Name","Full Name","Customer"],
      email: ["Customer Email","Email"],
      source: ["Source","Channel"],
      flight: ["Flight Number","Flight","FlightNumber"],
      status: ["Status"],
      money_received: ["Money Received","Paid","Amount Received"],
      money_charged: ["Money Charged","Charge","Price"],
    };

    const pick = (r: Record<string,string>, keys: string[]) => {
      for (const k of keys) {
        if (k in r && r[k] !== "") return r[k];
      }
      return "";
    };

    // Shape rows → DB schema
    const toInsert = rows.map(r => {
      const reference = pick(r, H.bookingId) || crypto.randomUUID();
      const plate = pick(r, H.reg).toUpperCase();

      const start_at = parseDateSmart(pick(r, H.start));
      const end_at = parseDateSmart(pick(r, H.end));

      const customer_name = pick(r, H.name) || "Unknown";
      const customer_email = pick(r, H.email) || null;
      const flight_number = pick(r, H.flight) || null;

      // source: omit for now to avoid enum issues; DB default applies
      const maybeSource = null; // we won't set source unless we map it to a valid enum

      // status: map common CSV values to valid enum values
      // Valid enum values: reserved, checked_in, checked_out, cancelled
      const rawStatus = (pick(r, H.status) || "").toLowerCase();
      const statusMap: Record<string, string> = {
        'confirmed': 'reserved',
        'complete': 'checked_out', 
        'completed': 'checked_out',
        'cancelled': 'cancelled',
        'canceled': 'cancelled',
        'pending': 'reserved',
        'reserved': 'reserved',
        'checked_in': 'checked_in',
        'checked_out': 'checked_out',
        '': 'reserved' // default
      };
      const maybeStatus = statusMap[rawStatus] || null;

      const money_received = Number(pick(r, H.money_received) || 0);
      const money_charged = Number(pick(r, H.money_charged) || 0);

      // Build row without source to avoid enum issues
      const row: any = {
        tenant_id,
        reference,
        plate,
        start_at: toIsoOrNull(start_at),
        end_at: toIsoOrNull(end_at),
        customer_name,
        customer_email,
        flight_number,
        money_received: Number.isFinite(money_received) ? money_received : 0,
        money_charged: Number.isFinite(money_charged) ? money_charged : 0,
      };
      if (maybeStatus) row.status = maybeStatus;
      // if (maybeSource) row.source = maybeSource;  // leave commented for now

      return row;
    });

    // Basic validation stats
    const invalidDates = toInsert.filter(r => !r.start_at || !r.end_at).length;
    slog("prepared_rows", {
      total: toInsert.length,
      invalidDates,
      sample: rows.slice(0,3).map(r => ({
        rawStart: pick(r, H.start),
        rawEnd: pick(r, H.end),
        parsedStart: toIsoOrNull(parseDateSmart(pick(r, H.start))),
        parsedEnd: toIsoOrNull(parseDateSmart(pick(r, H.end))),
      })),
    });

    // Insert with duplicate-safe constraint (reference per tenant)
    // Requires a unique index: (tenant_id, reference)
    const { data, error: insErr, count } = await supabase
      .from("bookings")
      .upsert(toInsert, { onConflict: "tenant_id,reference", ignoreDuplicates: false })
      .select("id, reference")
      .then(({ data, error }: { data: any, error: any }) => ({ data, error, count: data?.length ?? 0 }));

    if (insErr) {
      error("insert_error", insErr);
      return NextResponse.json({ ok:false, step:"insert", error: insErr.message }, { status: 500 });
    }

    slog("insert_ok", { inserted_or_updated: count });

    return NextResponse.json({
      ok: true,
      diagnostics: {
        tenant_id,
        csv: { headers, rows: rows.length, sample: rows.slice(0,2) },
        prepared: { total: toInsert.length, invalidDates },
        db: { affected: count },
      },
      rows: data?.slice(0,5), // echo first few
    });
  } catch (e: any) {
    console.error(`[import:${id}] fatal`, e);
    return NextResponse.json({ ok:false, reason:"FATAL", error: String(e?.message ?? e) }, { status: 500 });
  }
}
