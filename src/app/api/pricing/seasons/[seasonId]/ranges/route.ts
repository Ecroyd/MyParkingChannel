import { NextRequest, NextResponse } from "next/server";
import { sbFromRequestAuth } from "@/lib/sbClient";

export async function GET(req: NextRequest, { params }: { params: Promise<{ seasonId: string }>}) {
  const { seasonId } = await params;
  const sb = sbFromRequestAuth(req.headers.get("authorization") ?? undefined);
  const { data, error } = await sb.from("season_ranges").select("*").eq("season_id", seasonId).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ seasonId: string }>}) {
  const { seasonId } = await params;
  const sb = sbFromRequestAuth(req.headers.get("authorization") ?? undefined);
  const { start, end } = await req.json(); // ISO yyyy-mm-dd
  const { data, error } = await sb.from("season_ranges").insert({
    season_id: seasonId,
    range: `[${start},${end})`, // daterange inclusive start, exclusive end
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}
