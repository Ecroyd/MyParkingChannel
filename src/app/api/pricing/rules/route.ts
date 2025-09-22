import { NextRequest, NextResponse } from "next/server";
import { sbFromRequestAuth } from "@/lib/sbClient";

function parsePgDateRange(lit: string | null): [string,string] | null {
  if (!lit) return null; // e.g. "[2025-08-01,2025-08-15)"
  const m = lit.match(/^[\[\(]([^,]+),([^,\)]+)[\)\]]$/);
  if (!m) return null;
  return [m[1], m[2]];
}

export async function GET(req: NextRequest) {
  const sb = sbFromRequestAuth(req.headers.get("authorization") ?? undefined);
  const url = new URL(req.url);
  const expand = url.searchParams.get("expand") === "1";
  const showAll = url.searchParams.get("all") === "1"; // include inactive

  const sel = "*";
  const { data: rules, error } = await sb
    .from("pricing_rules")
    .select(sel)
    .order("priority", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (!expand) {
    return NextResponse.json({ data: showAll ? rules : rules.filter(r => r.is_active) });
  }

  // Expand into concrete date ranges for conflict detection
  const out = [];
  for (const r of rules as any[]) {
    const ranges: [string,string][] = [];
    if (r.date_range) {
      const pr = parsePgDateRange(r.date_range);
      if (pr) ranges.push(pr);
    } else if (r.season_id) {
      const { data: sr, error: e } = await sb
        .from("season_ranges")
        .select("range, id")
        .eq("season_id", r.season_id);
      if (e) return NextResponse.json({ error: e.message }, { status: 400 });
      for (const row of sr ?? []) {
        const pr = parsePgDateRange(row.range as string);
        if (pr) ranges.push(pr);
      }
    }
    out.push({ ...r, ranges });
  }

  const filtered = showAll ? out : out.filter((r:any)=>r.is_active);
  return NextResponse.json({ data: filtered });
}

export async function POST(req: NextRequest) {
  const sb = sbFromRequestAuth(req.headers.get("authorization") ?? undefined);
  const body = await req.json();
  const payload = { is_active: true, ...body }; // default active unless set
  const { data, error } = await sb.from("pricing_rules").insert(payload).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}

