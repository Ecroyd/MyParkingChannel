import { NextRequest, NextResponse } from "next/server";
import { sbFromRequestAuth } from "@/lib/sbClient";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }>}) {
  const { id } = await params;
  const sb = sbFromRequestAuth(req.headers.get("authorization") ?? undefined);
  const body = await req.json();
  const { data, error } = await sb.from("price_tiers").update(body).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }>}) {
  const { id } = await params;
  const sb = sbFromRequestAuth(req.headers.get("authorization") ?? undefined);
  const { error } = await sb.from("price_tiers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
