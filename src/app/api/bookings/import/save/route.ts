import { NextResponse } from 'next/server';
import { getServerSupabase, supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = await getServerSupabase();
    const admin = supabaseAdmin();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
      return NextResponse.json({ error: 'Authentication failed', details: authError.message }, { status: 401 });
    }
    
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { tenantId, mapping, manualSource, inspectResult } = body;
    
    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
    }

    if (!mapping || !inspectResult) {
      return NextResponse.json({ error: 'mapping and inspectResult required' }, { status: 400 });
    }

    // Check user's tenant roles
    const { data: userTenants, error: userTenantsError } = await admin
      .from('user_tenants')
      .select('tenant_id, role, is_default')
      .eq('user_id', user.id);
      
    if (userTenantsError) {
      return NextResponse.json({ error: 'Failed to check user permissions', details: userTenantsError.message }, { status: 500 });
    }
    
    // Check if user has access to this specific tenant
    const userTenant = userTenants?.find(ut => ut.tenant_id === tenantId);
    
    if (!userTenant) {
      return NextResponse.json({ 
        error: 'Forbidden', 
        details: `User does not have access to tenant ${tenantId}`,
        userTenants: userTenants || []
      }, { status: 403 });
    }
    
    // Check if user has required role
    const allowedRoles = ['owner', 'admin', 'member'];
    if (!allowedRoles.includes(userTenant.role)) {
      return NextResponse.json({ 
        error: 'Forbidden', 
        details: `User has role '${userTenant.role}' but needs one of: ${allowedRoles.join(', ')}`,
        userTenant
      }, { status: 403 });
    }

    // We need the full CSV data, not just sample rows
    // The inspect API only returns sample rows, so we need to read the full file from storage
    const { fileId, headers, totalRows } = inspectResult;
    
    if (!fileId || !headers || !totalRows) {
      console.error('IMPORT_SAVE_ERROR: Missing required data in inspectResult:', { inspectResult });
      return NextResponse.json({ error: 'Missing file data. Please upload a CSV file first.' }, { status: 400 });
    }

    // Read the full CSV file from storage
    const storageKey = `${tenantId}/${fileId}.csv`;
    console.log('🔍 IMPORT_SAVE: Reading full CSV from storage:', { storageKey, totalRows });
    
    const { data: fileData, error: downloadError } = await admin.storage
      .from('imports')
      .download(storageKey);

    if (downloadError) {
      console.error('IMPORT_SAVE_ERROR: Failed to download CSV file:', downloadError);
      return NextResponse.json({ error: 'Failed to read CSV file from storage.' }, { status: 400 });
    }

    // Parse the full CSV file
    const csvText = await fileData.text();
    const lines = csvText.split(/\r?\n/).filter(Boolean);
    const csvHeaders = lines[0].split(",").map(h => h.trim());
    const csvRows = lines.slice(1).map(line => {
      const cols = line.split(",").map(v => v.trim());
      const rec: Record<string,string> = {};
      csvHeaders.forEach((h,i) => rec[h] = cols[i] ?? "");
      return rec;
    });

    console.log('🔍 IMPORT_SAVE: Parsed full CSV:', { 
      headers: csvHeaders.length, 
      rows: csvRows.length,
      expectedTotal: totalRows 
    });
    
    const processedRows = csvRows.map((row: any, index: number) => {
      const processedRow: any = {
        tenant_id: tenantId,
        row_number: index + 1,
        raw_data: row,
        status: 'pending',
        created_by: user.id,
      };

      // Apply mapping
      Object.entries(mapping).forEach(([field, csvColumn]) => {
        if (csvColumn && typeof csvColumn === 'string' && row[csvColumn] !== undefined) {
          processedRow[field] = row[csvColumn];
        }
      });

      // Apply manual source if no source column was mapped
      if (!mapping.source && manualSource) {
        processedRow.source = manualSource;
      }

      return processedRow;
    });

    // Insert into booking_imports table
    const { data, error } = await admin
      .from('booking_imports')
      .insert(processedRows)
      .select('id');

    if (error) {
      console.error('IMPORT_SAVE_ERROR:', error);
      return NextResponse.json({ error: error.message, details: error }, { status: 400 });
    }

    console.log('✅ IMPORT_SAVE_SUCCESS:', {
      tenantId,
      userId: user.id,
      rowsInserted: data?.length || 0,
      totalRows: processedRows.length
    });

    return NextResponse.json({ 
      ok: true, 
      inserted: data?.length || 0,
      totalRows: processedRows.length
    });
  } catch (e: any) {
    console.error('❌ IMPORT_SAVE_FATAL:', e);
    return NextResponse.json({ error: e?.message ?? 'Unknown error', details: e }, { status: 500 });
  }
}
