import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const supabase = await getServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's tenant
  const adminSupabase = createAdminClient();
  const { data: userTenants, error: tenantError } = await adminSupabase
    .from('user_tenants')
    .select('tenant_id, role, is_default')
    .eq('user_id', user.id);

  if (tenantError || !userTenants || userTenants.length === 0) {
    return NextResponse.json({ error: "No tenant access found" }, { status: 404 });
  }

  const userTenant = userTenants.find((ut: any) => ut.is_default) || userTenants[0];
  const tenantId = userTenant.tenant_id;

  // Get pricing configuration
  const { data: pricing, error: pricingError } = await adminSupabase
    .from("tenant_pricing")
    .select("daily_rate, minute_rate, billing_type, currency")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (pricingError) {
    return NextResponse.json({ error: pricingError.message }, { status: 500 });
  }

  // Return with defaults if not found
  return NextResponse.json({
    success: true,
    data: {
      daily_rate: pricing?.daily_rate || 7.0,
      minute_rate: pricing?.minute_rate || (pricing?.daily_rate ? pricing.daily_rate / (24 * 60) : 7.0 / (24 * 60)),
      billing_type: pricing?.billing_type || 'day',
      currency: pricing?.currency || 'GBP'
    }
  });
}

export async function PUT(req: NextRequest) {
  const supabase = await getServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's tenant
  const adminSupabase = createAdminClient();
  const { data: userTenants, error: tenantError } = await adminSupabase
    .from('user_tenants')
    .select('tenant_id, role, is_default')
    .eq('user_id', user.id);

  if (tenantError || !userTenants || userTenants.length === 0) {
    return NextResponse.json({ error: "No tenant access found" }, { status: 404 });
  }

  const userTenant = userTenants.find((ut: any) => ut.is_default) || userTenants[0];
  const tenantId = userTenant.tenant_id;

  const body = await req.json();
  const { daily_rate, minute_rate, billing_type, currency } = body;

  // Validate billing_type
  if (billing_type && !['day', 'minute'].includes(billing_type)) {
    return NextResponse.json({ error: "billing_type must be 'day' or 'minute'" }, { status: 400 });
  }

  // Calculate minute_rate from daily_rate if not provided and billing_type is 'minute'
  let finalMinuteRate = minute_rate;
  if (billing_type === 'minute' && daily_rate && !minute_rate) {
    finalMinuteRate = daily_rate / (24 * 60);
  } else if (billing_type === 'minute' && !minute_rate && !daily_rate) {
    // If neither is provided, use default
    finalMinuteRate = 7.0 / (24 * 60);
  }

  // Get existing pricing to preserve values not being updated
  const { data: existing } = await adminSupabase
    .from("tenant_pricing")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const updateData: any = {
    tenant_id: tenantId,
    ...(daily_rate !== undefined && { daily_rate }),
    ...(finalMinuteRate !== undefined && { minute_rate: finalMinuteRate }),
    ...(billing_type !== undefined && { billing_type }),
    ...(currency !== undefined && { currency }),
    updated_at: new Date().toISOString()
  };

  // If daily_rate is updated and billing_type is 'minute', recalculate minute_rate
  if (daily_rate !== undefined && billing_type === 'minute' && !minute_rate) {
    updateData.minute_rate = daily_rate / (24 * 60);
  }

  // If minute_rate is updated and billing_type is 'day', recalculate daily_rate
  if (minute_rate !== undefined && billing_type === 'day' && !daily_rate) {
    updateData.daily_rate = minute_rate * (24 * 60);
  }

  const { data, error } = await adminSupabase
    .from("tenant_pricing")
    .upsert(updateData, { onConflict: 'tenant_id' })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, data });
}

