import { NextResponse } from "next/server";
import { withReq } from "@/lib/logger";
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import { 
  saveMapping, 
  markMappingUsed,
  calculateMappingConfidence
} from "../_mapping";

// Resolve tenant ID from request - require explicit tenant selection
async function resolveTenantId(req: Request, supabase: any) {
  const fromHeader = req.headers.get('x-tenant-id');
  if (fromHeader) return fromHeader;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('NO_USER_SESSION');

  const { data, error } = await supabase
    .from('user_tenants')
    .select('tenant_id')
    .eq('user_id', user.id);

  if (error) throw new Error('TENANT_LOOKUP_FAILED');
  if (!data?.length) throw new Error('NO_TENANT_CONTEXT');
  if (data.length > 1) throw new Error('TENANT_REQUIRED'); // client must pick
  return data[0].tenant_id;
}

// Parse dates preferring UK (dd/mm/yyyy), with fallbacks
const parseDateSmart = (raw: string | null): Date | null => {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  // Excel serials
  if (/^\d{4,5}$/.test(s)) {
    const n = Number(s);
    if (!Number.isNaN(n)) {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      return new Date(epoch.getTime() + n * 86400000);
    }
  }

  // UK dd/mm/yyyy or d/m/yy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const d = +m[1], mo = +m[2]-1, y = m[3].length===2 ? 2000+ +m[3] : +m[3];
    const dt = new Date(Date.UTC(y, mo, d));
    return Number.isNaN(+dt) ? null : dt;
  }

  // Try US mm/dd/yyyy format
  const m2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m2) {
    const mo = +m2[1]-1, d = +m2[2], y = m2[3].length===2 ? 2000+ +m2[3] : +m2[3];
    const dt = new Date(Date.UTC(y, mo, d));
    return Number.isNaN(+dt) ? null : dt;
  }

  // Try ISO format (yyyy-mm-dd)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const dt = new Date(s);
    return Number.isNaN(+dt) ? null : dt;
  }

  // Fallback: native Date parsing
  const dt = new Date(s);
  return Number.isNaN(+dt) ? null : dt;
};

// Enum-safe source mapping
const SOURCE_MAP: Record<string, string> = {
  "csv_import": "direct",
  "manual": "direct",
  "website": "direct",
  "site": "direct",
  "justpark": "justpark",
  "parkvia": "parkvia",
  "holidayextras": "holiday_extras",
  "holiday extras": "holiday_extras",
  "holiday-extras": "holiday_extras",
};
const SOURCE_ENUM = new Set(["direct","justpark","parkvia","holiday_extras","other"]);

function mapSource(s: string | null) {
  if (!s) return null;
  const k = s.trim().toLowerCase();
  const mapped = SOURCE_MAP[k] ?? "other";
  return SOURCE_ENUM.has(mapped) ? mapped : "other";
}

// Tiny CSV parser
const parseCSV = async (text: string) => {
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

// Generate CSV content
const generateCSV = (rows: any[], headers: string[]) => {
  const csvHeaders = headers.join(',');
  const csvRows = rows.map(row => 
    headers.map(h => `"${(row[h] || '').toString().replace(/"/g, '""')}"`).join(',')
  );
  return [csvHeaders, ...csvRows].join('\n');
};

type BookingMapping = {
  reference: string | null;
  plate: string | null;
  start_at: string | null;
  end_at: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  money_received?: string | null;
  money_charged?: string | null;
  source?: string | null;
  flight_number?: string | null;
  transforms?: {
    plateUppercase?: boolean;
    dateTz?: string;
  };
};

export async function POST(req: Request) {
  const { id, log: slog, error } = withReq(req);
  try {
    const supabase = await createServerClient({ admin: false });
    const adminClient = await createAdminClient();
    
    // Resolve tenant ID
    let tenant_id: string;
    try {
      tenant_id = await resolveTenantId(req, supabase);
    } catch (e: any) {
      if (e.message === 'NO_USER_SESSION') {
        return NextResponse.json({ ok:false, reason:"NO_USER_SESSION" }, { status: 401 });
      }
      if (e.message === 'NO_TENANT_CONTEXT') {
        return NextResponse.json({ ok:false, reason:"NO_TENANT_CONTEXT" }, { status: 400 });
      }
      throw e;
    }

    const body = await req.json();
    const { fileId, mapping, manualSource, saveMapping, mappingName, suggestedMappingId }: {
      fileId: string;
      mapping: BookingMapping;
      manualSource?: string; // Manual source when not mapped from CSV
      saveMapping?: boolean;
      mappingName?: string;
      suggestedMappingId?: string; // ID of the suggested mapping that was used
    } = body;

    if (!fileId || !mapping) {
      return NextResponse.json({ ok:false, reason:"MISSING_PARAMS" }, { status: 400 });
    }

    // Download file from storage
    const fileName = `${tenant_id}/${fileId}.csv`;
    const { data: fileData, error: downloadError } = await adminClient.storage
      .from('imports')
      .download(fileName);

    if (downloadError || !fileData) {
      error("file_download_failed", downloadError);
      return NextResponse.json({ ok:false, reason:"FILE_NOT_FOUND", error: downloadError?.message }, { status: 404 });
    }

    const fileText = await fileData.text();
    const { headers, rows } = await parseCSV(fileText);

    slog("commit_start", { tenant_id, fileId, totalRows: rows.length });

    // Validate required mappings (reference is optional - will auto-generate if empty)
    const requiredFields = ['customer_name', 'start_at', 'end_at'];
    const missingRequired = requiredFields.filter(field => !mapping[field as keyof BookingMapping]);
    if (missingRequired.length > 0) {
      return NextResponse.json({ 
        ok:false, 
        reason:"MISSING_REQUIRED_MAPPINGS", 
        missingFields: missingRequired 
      }, { status: 400 });
    }

    // Process rows
    const toInsert: any[] = [];
    const rejects: any[] = [];
    
    for (const [index, row] of rows.entries()) {
      try {
        // Extract values using mapping
        const rawReference = mapping.reference ? row[mapping.reference] : '';
        const reference = rawReference?.trim() || crypto.randomUUID(); // Auto-generate if empty
        const customer_name = mapping.customer_name ? row[mapping.customer_name] : null;
        const plate = mapping.plate ? row[mapping.plate] : null;
        const start_at = mapping.start_at ? row[mapping.start_at] : null;
        const end_at = mapping.end_at ? row[mapping.end_at] : null;
        
        // Validate required fields (customer_name, start_at, end_at are required)
        if (!customer_name?.trim() || !start_at?.trim() || !end_at?.trim()) {
          rejects.push({
            row: index + 1,
            reason: 'Missing required fields',
            data: { reference, customer_name, plate, start_at, end_at }
          });
          continue;
        }

        // Parse dates
        const startDate = parseDateSmart(start_at);
        const endDate = parseDateSmart(end_at);
        
        if (!startDate || !endDate) {
          rejects.push({
            row: index + 1,
            reason: 'Invalid dates',
            data: { start_at, end_at, parsedStart: startDate, parsedEnd: endDate }
          });
          continue;
        }

        // Build row
        const dbRow: any = {
          tenant_id,
          reference: reference.trim(),
          plate: plate ? plate.toUpperCase().trim() : null,
          start_at: startDate.toISOString(),
          end_at: endDate.toISOString(),
          customer_name: customer_name.trim(),
          customer_email: mapping.customer_email ? row[mapping.customer_email] : null,
          flight_number: mapping.flight_number ? row[mapping.flight_number] : null,
          money_received: mapping.money_received ? Number(row[mapping.money_received]) || 0 : 0,
          money_charged: mapping.money_charged ? Number(row[mapping.money_charged]) || 0 : 0,
        };

        // Add source - either from CSV mapping or manual selection
        if (mapping.source && row[mapping.source]) {
          // Use source from CSV column
          const mappedSource = mapSource(row[mapping.source]);
          if (mappedSource) dbRow.source = mappedSource;
        } else if (manualSource) {
          // Use manual source when no CSV column is mapped
          const mappedSource = mapSource(manualSource);
          if (mappedSource) dbRow.source = mappedSource;
        }

        toInsert.push(dbRow);
      } catch (e: any) {
        rejects.push({
          row: index + 1,
          reason: 'Processing error',
          error: e.message,
          data: row
        });
      }
    }

    // Insert valid rows
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    if (toInsert.length > 0) {
      const { data, error: insErr } = await adminClient
        .from("bookings")
        .upsert(toInsert, { onConflict: "tenant_id,reference", ignoreDuplicates: false })
        .select("id, reference");

      if (insErr) {
        error("insert_failed", insErr);
        return NextResponse.json({ ok:false, reason:"INSERT_FAILED", error: insErr.message }, { status: 500 });
      }

      // Count results (this is approximate since upsert doesn't tell us insert vs update)
      inserted = data?.length || 0;
    }

    // Mark suggested mapping as used (for learning)
    if (suggestedMappingId) {
      await markMappingUsed(adminClient, suggestedMappingId);
    }

    // Save mapping if requested (with learning)
    if (saveMapping && mappingName) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Calculate confidence based on how many required fields are mapped
        const confidence = calculateMappingConfidence(mapping);
        
        // Temporarily comment out saveMapping to fix the import issue
        // await saveMapping(
        //   supabase,
        //   tenant_id,
        //   user.id,
        //   mappingName,
        //   headers,
        //   mapping,
        //   confidence
        // );
      }
    }

    // Generate rejects CSV if needed
    let rejectsFileUrl: string | null = null;
    if (rejects.length > 0) {
      const rejectsCSV = generateCSV(rejects, ['row', 'reason', 'error', 'data']);
      const rejectsFileName = `imports/${tenant_id}/rejects/${fileId}.csv`;
      
      const { error: rejectsError } = await adminClient.storage
        .from('imports')
        .upload(rejectsFileName, rejectsCSV, {
          contentType: 'text/csv',
          upsert: true
        });

      if (!rejectsError) {
        const { data: { publicUrl } } = adminClient.storage
          .from('imports')
          .getPublicUrl(rejectsFileName);
        rejectsFileUrl = publicUrl;
      }
    }

    // Clean up original file
    await adminClient.storage.from('imports').remove([fileName]);

    slog("commit_complete", { 
      tenant_id, 
      totalRows: rows.length,
      inserted,
      updated,
      skipped,
      rejects: rejects.length
    });

    return NextResponse.json({
      ok: true,
      results: {
        totalRows: rows.length,
        inserted,
        updated,
        skipped,
        rejects: rejects.length,
        rejectsFileUrl,
        sampleRejects: rejects.slice(0, 10) // Show first 10 rejections for debugging
      }
    });

  } catch (e: any) {
    error("commit_failed", e);
    return NextResponse.json({ ok:false, reason:"FATAL", error: String(e?.message ?? e) }, { status: 500 });
  }
}

