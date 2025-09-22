import { NextRequest, NextResponse } from "next/server";
import { sbFromRequestAuth } from "@/lib/sbClient";

export async function GET(req: NextRequest) {
  const sb = sbFromRequestAuth(req.headers.get("authorization") ?? undefined);
  const { data, error } = await sb.from("seasons").select("*").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const sb = sbFromRequestAuth(req.headers.get("authorization") ?? undefined);
  const body = await req.json();
  const { data, error } = await sb.from("seasons").insert(body).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}

