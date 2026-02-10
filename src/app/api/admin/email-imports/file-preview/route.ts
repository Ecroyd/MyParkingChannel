import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server-admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const fileId = url.searchParams.get("fileId");
    if (!fileId) {
      return NextResponse.json({ error: "Missing fileId" }, { status: 400 });
    }

    const supabase = await getServerSupabase();
    const admin = createAdminClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: file, error: fileErr } = await admin
      .from("ingest_email_files")
      .select("id, filename, content_type, storage_bucket, storage_path, file_size, email_id")
      .eq("id", fileId)
      .single();

    if (fileErr || !file) {
      return NextResponse.json(
        { error: "File not found", details: fileErr?.message },
        { status: 404 }
      );
    }

    if (!file.storage_bucket || !file.storage_path) {
      return NextResponse.json(
        { error: "File has no storage object" },
        { status: 404 }
      );
    }

    const { data: st } = await admin
      .from("booking_import_staging")
      .select("tenant_id")
      .eq("source_email_id", file.email_id)
      .eq("source_filename", file.filename)
      .limit(1);

    let tenantId: string | null = st?.[0]?.tenant_id ?? null;

    if (!tenantId) {
      const { data: pa } = await admin
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", auth.user.id)
        .maybeSingle();

      if (!pa) {
        return NextResponse.json(
          { error: "Not authorized (file has no tenant linkage yet)" },
          { status: 403 }
        );
      }
    } else {
      const { data: ut } = await admin
        .from("user_tenants")
        .select("user_id, tenant_id")
        .eq("user_id", auth.user.id)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (!ut) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: blob, error: dlErr } = await admin.storage
      .from(file.storage_bucket)
      .download(file.storage_path);

    if (dlErr || !blob) {
      return NextResponse.json(
        { error: "Failed to download file", details: dlErr?.message },
        { status: 500 }
      );
    }

    const MAX_BYTES = 200_000;
    const buf = Buffer.from(await blob.arrayBuffer());
    const truncated = buf.length > MAX_BYTES ? buf.subarray(0, MAX_BYTES) : buf;
    const text = truncated.toString("utf-8");

    return NextResponse.json({
      id: file.id,
      filename: file.filename,
      content_type: file.content_type,
      file_size: file.file_size,
      truncated: buf.length > MAX_BYTES,
      preview: text,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
