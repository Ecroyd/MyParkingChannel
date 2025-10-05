import { NextResponse } from "next/server";
import { withReq } from "@/lib/logger";
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import { 
  headerSignature, 
  findBestMapping, 
  autoGuessMapping,
  type BookingMapping,
  type MappingSuggestion 
} from "../_mapping";

// Resolve tenant ID from request - require explicit tenant selection
async function resolveTenantId(req: Request, supabase: any, adminClient: any) {
  const fromHeader = req.headers.get('x-tenant-id');
  if (fromHeader) return fromHeader;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('NO_USER_SESSION');

  const { data, error } = await adminClient
    .from('user_tenants')
    .select('tenant_id')
    .eq('user_id', user.id);

  if (error) throw new Error('TENANT_LOOKUP_FAILED');
  if (!data?.length) throw new Error('NO_TENANT_CONTEXT');
  if (data.length > 1) throw new Error('TENANT_REQUIRED'); // client must pick
  return data[0].tenant_id;
}

// Tiny CSV parser (no deps)
const parseCSV = async (f: File) => {
  const text = await f.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(",").map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    const cols = line.split(",").map(v => v.trim());
    const rec: Record<string,string> = {};
    headers.forEach((h,i) => rec[h] = cols[i] ?? "");
    return rec;
  });
  return { headers, rows };
};

// Auto-guess logic moved to _mapping.ts

export async function POST(req: Request) {
  const { id, log: slog, error } = withReq(req);
  try {
    console.log('🔍 Import/inspect: Starting file inspection...')
    const supabase = await createServerClient();
    const adminClient = await createAdminClient();

    // 1) trust header, but verify it's a tenant the user belongs to
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    if (!tenantId) return NextResponse.json({ ok:false, reason:"TENANT_REQUIRED" }, { status:400 });

    const { data: links } = await adminClient
      .from("user_tenants")
      .select("tenant_id")
      .eq("tenant_id", tenantId)
      .limit(1);
    if (!links?.length) return NextResponse.json({ ok:false, reason:"TENANT_FORBIDDEN" }, { status:403 });

    const form = await req.formData();
    const file = form.get("file") as File | null;

    if (!file) return NextResponse.json({ ok:false, reason:"NO_FILE" }, { status: 400 });

    // Parse CSV (first 200 lines for preview)
    const { headers, rows } = await parseCSV(file);
    const sampleRows = rows.slice(0, 200); // Limit for preview
    
    // Create header signature for intelligent matching
    const signature = headerSignature(headers);
    
    slog("inspect", { 
      tenant_id: tenantId, 
      totalRows: rows.length, 
      previewRows: sampleRows.length,
      headers,
      signature
    });

    // Find best saved mapping (exact or fuzzy match)
    const suggested = await findBestMapping(adminClient, tenantId, signature);
    
    // Fallback to auto-guess if no saved mapping found
    const autoGuess = autoGuessMapping(headers);
    
    // Generate file ID and save to storage
    const fileId = crypto.randomUUID();
    const key = `${tenantId}/${fileId}.csv`;      // ✅ first segment is TENANT_ID
    console.log("STORAGE KEY:", key);
    
    // Save file to Supabase Storage
    console.log("Attempting to upload file to storage:", { key, fileSize: file.size, contentType: file.type });
    
    const { data: uploadData, error: uploadError } = await adminClient.storage
      .from('imports')
      .upload(key, file, {
        contentType: 'text/csv',
        upsert: false
      });

    if (uploadError) {
      console.error("Storage upload failed:", uploadError);
      error("storage_upload_failed", uploadError);
      return NextResponse.json({ ok:false, reason:"STORAGE_ERROR", error: uploadError.message }, { status: 500 });
    }

    console.log("File uploaded successfully:", uploadData);

    // Get saved mappings for this tenant
    const { data: savedMappings } = await adminClient
      .from('booking_import_mappings')
      .select('id, name, mapping, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    return NextResponse.json({
      ok: true,
      fileId,
      headers,
      sampleRows: sampleRows.slice(0, 20), // First 20 for UI preview
      totalRows: rows.length,
      signature,
      autoGuess: {
        signature,
        suggested: suggested ? {
          mapping: suggested.mapping,
          confidence: suggested.confidence,
          name: suggested.name,
          match: suggested.match,
          id: suggested.id
        } : null
      },
      savedMappings: savedMappings || [],
      requiredFields: ['customer_name', 'start_at', 'end_at'],
      optionalFields: ['reference', 'plate', 'customer_email', 'money_received', 'money_charged', 'source', 'flight_number']
    });

  } catch (e: any) {
    error("inspect_failed", e);
    return NextResponse.json({ ok:false, reason:"FATAL", error: String(e?.message ?? e) }, { status: 500 });
  }
}

