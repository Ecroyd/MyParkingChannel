import { NextRequest, NextResponse } from "next/server";
import { sbFromRequestAuth } from "@/lib/sbClient";

export async function POST(req: NextRequest) {
  const sb = sbFromRequestAuth(req.headers.get("authorization") ?? undefined);
  const { rate_plan_id, start_date, end_date, channel } = await req.json();

  const { data: lines, error: e1 } = await sb.rpc("calculate_rate_plan_pricing", {
    p_tenant_id: null,
    p_rate_plan_id: rate_plan_id,
    p_start_date: start_date,
    p_end_date: end_date,
    p_channel: channel ?? null,
  });
  if (e1) return NextResponse.json({ error: e1.message }, { status: 400 });

  const { data: total, error: e2 } = await sb.rpc("calculate_rate_plan_total", {
    p_tenant_id: null,
    p_rate_plan_id: rate_plan_id,
    p_start_date: start_date,
    p_end_date: end_date,
    p_channel: channel ?? null,
  });
  if (e2) return NextResponse.json({ error: e2.message }, { status: 400 });

  return NextResponse.json({ lines, total: total?.[0] ?? null });
}

