import { createServerClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/guards";
import { NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { sb } = await requirePlatformAdmin();
    const { id } = await params;
    const { password, email } = await req.json();

    if (!password || !email) {
      return NextResponse.json({ error: "Password and email are required" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    // Find the user by email
    const { data: users, error: userError } = await sb.auth.admin.listUsers();
    if (userError) {
      return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
    }

    const user = users.users.find(u => u.email === email);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Update the user's password using Supabase Admin API
    const { error: updateError } = await sb.auth.admin.updateUserById(user.id, {
      password: password
    });

    if (updateError) {
      console.error('Error updating password:', updateError);
      return NextResponse.json({ error: "Failed to update password" }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: "Password updated successfully" 
    });
  } catch (error: any) {
    console.error('Error setting password:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
