// src/app/api/tenant/secrets/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from '@/lib/supabase/server';
import { getServiceSupabase } from '@/lib/supabase/service';

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "UNAUTH" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');
    
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "MISSING_TENANT_ID" }, { status: 400 });
    }

    // Verify user has access to this tenant
    const { data: userTenant } = await supabase
      .from("user_tenants")
      .select("tenant_id")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!userTenant) {
      return NextResponse.json({ ok: false, error: "TENANT_ACCESS_DENIED" }, { status: 403 });
    }

    // Get tenant secrets (only publishable key for client)
    const admin = getServiceSupabase();
    const { data: secrets } = await admin
      .from("tenant_secrets")
      .select("stripe_publishable_key")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    return NextResponse.json({ 
      ok: true, 
      publishableKey: secrets?.stripe_publishable_key || null 
    });
  } catch (e: any) {
    console.error("Secrets fetch error:", e);
    return NextResponse.json({ ok: false, error: e.message ?? "ERROR" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "UNAUTH" }, { status: 401 });

    const body = await req.json();
    const { tenantId, stripePublishableKey, stripeSecretKey } = body;
    
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "MISSING_TENANT_ID" }, { status: 400 });
    }

    // Verify user has access to this tenant
    const { data: userTenant } = await supabase
      .from("user_tenants")
      .select("tenant_id")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!userTenant) {
      return NextResponse.json({ ok: false, error: "TENANT_ACCESS_DENIED" }, { status: 403 });
    }

    // Save tenant secrets (admin client to bypass RLS)
    const admin = await getServerSupabase({ admin: true });
    const { error } = await admin
      .from("tenant_secrets")
      .upsert({
        tenant_id: tenantId,
        stripe_publishable_key: stripePublishableKey || null,
        stripe_secret_key: stripeSecretKey || null,
        updated_at: new Date().toISOString()
      });

    if (error) {
      return NextResponse.json({ ok: false, error: "SAVE_FAILED", details: error }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Secrets save error:", e);
    return NextResponse.json({ ok: false, error: e.message ?? "ERROR" }, { status: 500 });
  }
}

