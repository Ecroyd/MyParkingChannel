import { NextResponse } from "next/server";

function appBase() {
  return process.env.APP_BASE_DOMAIN || "http://localhost:3002";
}

/**
 * Builds a backend booking URL like:
 *   https://myparkingchannel.app/admin/bookings/new?tenant=testbusiness&start=2025-09-12&end=2025-09-15&email=...&plate=...
 * Adjust the path if your backend booking page lives elsewhere.
 */
function buildTargetURL(q: URLSearchParams) {
  const base = appBase().replace(/\/$/, "");
  const target = new URL(base + "/admin/bookings/new"); // adjust if your path differs
  ["tenant","slug","start","end","email","plate"].forEach((k) => {
    const v = q.get(k);
    if (v) target.searchParams.set(k === "slug" ? "tenant" : k, v);
  });
  return target.toString();
}

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  if (!slug || !start || !end) {
    return NextResponse.json({ ok: false, error: "Missing slug/start/end" }, { status: 400 });
  }

  // Minimal validation done — real validation happens on your backend page.
  const target = buildTargetURL(url.searchParams);
  return NextResponse.redirect(target, { status: 307 });
}
