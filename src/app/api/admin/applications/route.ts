import { createServerClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/guards";
import { NextResponse } from "next/server";

export async function GET() {
  const { sb } = await requirePlatformAdmin();
  
  const { data: applications, error } = await sb
    .from('tenant_applications')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ applications });
}
