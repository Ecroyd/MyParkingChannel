import { createAdminClient } from "@/lib/supabase/server-admin";
import { getCurrentTenantContext } from "@/lib/auth/current-tenant-context";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Delete an email import file
 * This removes the file record but keeps the email
 */
export async function DELETE(req: Request) {
  try {
    const ctx = await getCurrentTenantContext();
    if (!ctx) {
      return NextResponse.json({ ok: false, error: "No tenant context" }, { status: 401 });
    }

    const { fileId } = await req.json();
    if (!fileId) {
      return NextResponse.json({ ok: false, error: "Missing fileId" }, { status: 400 });
    }

    const adminClient = await createAdminClient();

    // Get file to verify it exists
    const { data: file, error: fileError } = await adminClient
      .from("ingest_email_files")
      .select("id, storage_path, storage_bucket")
      .eq("id", fileId)
      .single();

    if (fileError || !file) {
      return NextResponse.json({ ok: false, error: "File not found" }, { status: 404 });
    }

    // Delete from storage (if exists)
    if (file.storage_path && file.storage_bucket) {
      try {
        await adminClient.storage
          .from(file.storage_bucket)
          .remove([file.storage_path]);
      } catch (storageErr) {
        console.warn("[DELETE FILE] Storage deletion failed (may already be deleted):", storageErr);
        // Continue - file record deletion is more important
      }
    }

    // Delete file record
    const { error: deleteError } = await adminClient
      .from("ingest_email_files")
      .delete()
      .eq("id", fileId);

    if (deleteError) {
      console.error("[DELETE FILE] Error deleting file record:", deleteError);
      return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "File deleted successfully" });
  } catch (err: any) {
    console.error("[DELETE FILE] Unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
