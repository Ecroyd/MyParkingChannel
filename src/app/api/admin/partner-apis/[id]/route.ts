// src/app/api/admin/partner-apis/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/requireUser";

// PATCH - Update a partner API key (toggle active, update scopes)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const resolvedParams = await params;
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
    const updates: any = {};

    if (typeof body.is_active === "boolean") {
      updates.is_active = body.is_active;
    }

    if (Array.isArray(body.scopes)) {
      updates.scopes = body.scopes;
    }

    if (body.channel_id !== undefined) {
      // Validate channel_id belongs to tenant if provided
      if (body.channel_id) {
        const { data: channel, error: channelError } = await supabase
          .from("tenant_channels")
          .select("id")
          .eq("id", body.channel_id)
          .eq("tenant_id", userTenant.tenant_id)
          .single();

        if (channelError || !channel) {
          return NextResponse.json(
            { error: "Invalid channel_id or channel does not belong to tenant" },
            { status: 400 }
          );
        }
      }
      updates.channel_id = body.channel_id || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid updates provided" }, { status: 400 });
    }

    // Update the key (ensuring it belongs to the user's tenant)
    const { data: updated, error: updateError } = await supabase
      .from("partner_api_keys")
      .update(updates)
      .eq("id", resolvedParams.id)
      .eq("tenant_id", userTenant.tenant_id)
      .select(`
        id,
        name,
        scopes,
        is_active,
        last_used_at,
        created_at,
        channel_id,
        tenant_channels (
          id,
          code,
          name
        )
      `)
      .single();

    if (updateError) {
      if (updateError.code === "PGRST116") {
        return NextResponse.json({ error: "Key not found" }, { status: 404 });
      }
      console.error("Error updating partner API key:", updateError);
      return NextResponse.json({ error: "Failed to update key" }, { status: 500 });
    }

    return NextResponse.json({ key: updated });
  } catch (error: any) {
    console.error("Partner APIs PATCH error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// DELETE - Delete a partner API key
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const resolvedParams = await params;
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

    // Delete the key (ensuring it belongs to the user's tenant)
    const { error: deleteError } = await supabase
      .from("partner_api_keys")
      .delete()
      .eq("id", resolvedParams.id)
      .eq("tenant_id", userTenant.tenant_id);

    if (deleteError) {
      console.error("Error deleting partner API key:", deleteError);
      return NextResponse.json({ error: "Failed to delete key" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Partner APIs DELETE error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

