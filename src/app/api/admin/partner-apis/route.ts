// src/app/api/admin/partner-apis/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";
import { requireUser } from "@/lib/auth/requireUser";

// GET - List all partner API keys for the user's tenant
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = createAdminClient();

    // Get user's tenant
    const { data: userTenant } = await supabase
      .from("user_tenants")
      .select("tenant_id")
      .eq("user_id", user.id)
      .eq("is_default", true)
      .maybeSingle();

    if (!userTenant?.tenant_id) {
      return NextResponse.json({ error: "No tenant found" }, { status: 400 });
    }

    const { data: keys, error } = await supabase
      .from("partner_api_keys")
      .select("id, name, scopes, is_active, last_used_at, created_at")
      .eq("tenant_id", userTenant.tenant_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching partner API keys:", error);
      return NextResponse.json({ error: "Failed to fetch keys" }, { status: 500 });
    }

    return NextResponse.json({ keys: keys || [] });
  } catch (error: any) {
    console.error("Partner APIs GET error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// POST - Create a new partner API key
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = createAdminClient();

    // Get user's tenant
    const { data: userTenant } = await supabase
      .from("user_tenants")
      .select("tenant_id")
      .eq("user_id", user.id)
      .eq("is_default", true)
      .maybeSingle();

    if (!userTenant?.tenant_id) {
      return NextResponse.json({ error: "No tenant found" }, { status: 400 });
    }

    const body = await req.json();
    const { name, scopes } = body;

    if (!name || !Array.isArray(scopes)) {
      return NextResponse.json(
        { error: "Missing required fields: name, scopes" },
        { status: 400 }
      );
    }

    // Generate a random API key (64 characters, hex)
    const rawApiKey = crypto.randomBytes(32).toString("hex");
    const apiKeyHash = crypto.createHash("sha256").update(rawApiKey).digest("hex");

    // Insert into database
    const { data: inserted, error: insertError } = await supabase
      .from("partner_api_keys")
      .insert({
        tenant_id: userTenant.tenant_id,
        name,
        api_key_hash: apiKeyHash,
        scopes: scopes,
        is_active: true,
      })
      .select("id, name, scopes, is_active, created_at")
      .single();

    if (insertError) {
      console.error("Error creating partner API key:", insertError);
      return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
    }

    // Return the inserted record + the raw key (only shown once)
    return NextResponse.json({
      key: inserted,
      rawApiKey, // Only returned on creation
    });
  } catch (error: any) {
    console.error("Partner APIs POST error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

