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
    if (!mapping) {
      return NextResponse.json({ error: 'mapping required' }, { status: 400 });
    }
    if (!inspectResult) {
      return NextResponse.json({ error: 'inspectResult required' }, { status: 400 });
    }

    // Check user's tenant roles
    const { data: userTenants, error: userTenantsError } = await admin
      .from('user_tenants')
      .select('tenant_id, role, is_default')
      .eq('user_id', user.id);
      
    if (userTenantsError) {
      return NextResponse.json({ error: 'Failed to check user permissions', details: userTenantsError.message }, { status: 500 });
    }
    
    const userTenant = userTenants?.find(ut => ut.tenant_id === tenantId);
    
    if (!userTenant) {
      return NextResponse.json({ 
        error: 'Forbidden', 
        details: `User does not have access to tenant ${tenantId}`,
        userTenants: userTenants || []
      }, { status: 403 });
    }
    
    const allowedRoles = ['owner', 'admin', 'member'];
    if (!allowedRoles.includes(userTenant.role)) {
      return NextResponse.json({ 
        error: 'Forbidden', 
        details: `User has role '${userTenant.role}' but needs one of: ${allowedRoles.join(', ')}`,
        userTenant
      }, { status: 403 });
    }

    // Read the full CSV file from storage
    const { fileId, headers, totalRows } = inspectResult;
    
    if (!fileId || !headers || !totalRows) {
      return NextResponse.json({ error: 'Missing file data. Please upload a CSV file first.' }, { status: 400 });
    }

    const storageKey = `${tenantId}/${fileId}.csv`;
    
    const { data: fileData, error: downloadError } = await admin.storage
      .from('imports')
      .download(storageKey);

    if (downloadError) {
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
    
    const processedRows = csvRows.map((row: any, index: number) => ({
      tenant_id: tenantId,
      source_file: `${fileId}.csv`,
      raw_payload: {
        row_data: row,
        row_number: index + 1,
        mapping: mapping,
        manual_source: manualSource
      },
      status: 'pending',
      created_by: user.id,
    }));

    // Insert into booking_import_staging table
    const { data, error } = await admin
      .from('booking_import_staging')
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
