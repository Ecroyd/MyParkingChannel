import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server-admin";

type Body = {
  ingestEmailFileId: string;
};

export async function POST(req: Request) {
  const { ingestEmailFileId } = (await req.json()) as Body;

  const supabase = await getServerSupabase();
  const admin = createAdminClient();

  // 1) Ensure user is logged in
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 2) Load ingest_email_files row
  const { data: file, error: fileErr } = await admin
    .from("ingest_email_files")
    .select("id, email_id, filename, storage_bucket, storage_path, content_type, file_size, parser_key, detected_source")
    .eq("id", ingestEmailFileId)
    .single();

  if (fileErr || !file) return NextResponse.json({ error: "File not found" }, { status: 404 });
  if (!file.storage_bucket || !file.storage_path) {
    return NextResponse.json({ error: "File has no storage object" }, { status: 404 });
  }

  // 3) Authorize: user must have tenant access to whatever tenant this file maps to.
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

  // 4) Create signed URL
  const expiresIn = 60 * 5; // 5 minutes
  const { data: signed, error: signErr } = await admin.storage
    .from(file.storage_bucket)
    .createSignedUrl(file.storage_path, expiresIn);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: "Could not sign url" }, { status: 500 });
  }

  return NextResponse.json({
    bucket: file.storage_bucket,
    path: file.storage_path,
    filename: file.filename,
    contentType: file.content_type,
    fileSize: file.file_size,
    parserKey: file.parser_key,
    detectedSource: file.detected_source,
    signedUrl: signed.signedUrl,
  });
}
