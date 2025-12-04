import { NextResponse } from "next/server";
import { getServerSupabase } from '@/lib/supabase/server';
import { getCurrentTenant } from "@/lib/tenant";
import { startOfDay, endOfDay, addDays } from "date-fns";

type Row = { start_at: string; end_at: string; source: string | null; external_source: string | null; tenant_id: string };

function daysBetween(start: Date, endExclusive: Date): Date[] {
  const days: Date[] = [];
  for (let d = startOfDay(start); d < endExclusive; d = addDays(d, 1)) days.push(d);
  return days;
}

// overlap: booking counts on a day if [start_at,end_at] spans that calendar day in the chosen tz-less range
function overlapsDay(b: { start: Date; end: Date }, day: Date) {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  return b.end >= dayStart && b.start <= dayEnd;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tz = url.searchParams.get("tz") ?? "UTC"; // kept for future, not applied here to keep it simple
  const vehicle = url.searchParams.get("vehicle"); // currently ignored; add later if you have a column
  const tenant = url.searchParams.get("tenant");   // allow explicit tenant override (optional)

  // default: last 14 days
  const start = new Date(url.searchParams.get("start") ?? addDays(new Date(), -14).toISOString());
  const end = new Date(url.searchParams.get("end") ?? addDays(new Date(), 1).toISOString()); // exclusive

  console.log("[analytics] Request params:", { tz, vehicle, tenant, start: start.toISOString(), end: end.toISOString() });

  const supabase = await getServerSupabase();
  const { data: user, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user?.user) {
    console.error("[analytics] no user/session", userErr);
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  console.log("[analytics] User authenticated:", user.user.email);

  // Resolve tenant_id
  // 1) from query ?tenant=... (admin page already knows the tenant)
  // 2) or from getCurrentTenant() helper
  let tenantId = tenant;
  
  if (!tenantId) {
    try {
      const currentTenant = await getCurrentTenant();
      tenantId = currentTenant.id;
    } catch (error) {
      console.error("[analytics] failed to get current tenant:", error);
      return NextResponse.json({ error: "MISSING_TENANT" }, { status: 400 });
    }
  }

  if (!tenantId) {
    console.error("[analytics] missing tenant_id");
    return NextResponse.json({ error: "MISSING_TENANT" }, { status: 400 });
  }

  console.log("[analytics] Using tenant_id:", tenantId);

  // Pull only bookings that could overlap the window (cheap filter)
  // Overlap condition: start_at < end && end_at >= start
  const { data, error } = await supabase
    .from("bookings")
    .select("start_at,end_at,source,external_source,tenant_id")
    .eq("tenant_id", tenantId)
    .lt("start_at", end.toISOString())
    .gte("end_at", start.toISOString());

  if (error) {
    console.error("[analytics] supabase error", error);
    return NextResponse.json({ error: "SUPABASE_ERROR", details: error.message }, { status: 500 });
  }

  console.log("[analytics] Found bookings:", data?.length || 0);

  const rows: Row[] = data ?? [];
  const days = daysBetween(start, end);

  // Aggregate per day per channel
  const out: { day: string; channel: string; occupancy: number }[] = [];
  
  // Get supplier name: prefer external_source, fallback to source
  const getSupplierName = (r: Row): string => {
    if (r.external_source && r.external_source.trim().length > 0) {
      return r.external_source.trim();
    }
    return r.source || "other";
  };

  for (const day of days) {
    const dayISO = day.toISOString().slice(0, 10);
    const byChannel = new Map<string, number>();

    for (const r of rows) {
      const book = { start: new Date(r.start_at), end: new Date(r.end_at) };
      if (!overlapsDay(book, day)) continue;
      const key = getSupplierName(r);
      byChannel.set(key, (byChannel.get(key) ?? 0) + 1);
    }

    // Even if empty, return [] for that day (UI can handle empties)
    for (const [channel, count] of byChannel.entries()) {
      out.push({ day: dayISO, channel, occupancy: count });
    }
  }

  console.log("[analytics] Returning data points:", out.length);

  return NextResponse.json({ data: out, meta: { tenantId, tz, start, end } }, { status: 200 });
}
