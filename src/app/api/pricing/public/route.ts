import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");
  
  if (!tenantId) {
    return NextResponse.json({ error: "Tenant ID is required" }, { status: 400 });
  }

  const supabase = getServerSupabase();

  // Get pricing for the tenant (public endpoint, no auth required)
  const { data, error } = await supabase
    .from("tenant_pricing")
    .select("daily_rate")
    .eq("tenant_id", tenantId)
    .single();

  if (error) {
    // If no pricing found, return default
    return NextResponse.json({ 
      success: true, 
      data: { dailyRate: 7.0, currency: "GBP" } 
    });
  }

  return NextResponse.json({ 
    success: true, 
    data: { dailyRate: data.daily_rate || 7.0, currency: "GBP" } 
  });
}
