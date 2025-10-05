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
    const { tenantId } = body;
    
    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
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

    // Get the staging data
    const { data: stagingData, error: stagingError } = await admin
      .from('booking_import_staging')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'pending');
    
    if (stagingError) {
      return NextResponse.json({ error: 'Failed to get staging data', details: stagingError.message }, { status: 500 });
    }

    if (!stagingData || stagingData.length === 0) {
      return NextResponse.json({ 
        ok: true, 
        result: [],
        summary: { processed: 0, inserted: 0, failed: 0 }
      });
    }

    let processed = 0;
    let inserted = 0;
    let failed = 0;
    const errors: string[] = [];

    // Process each staging record
    for (const record of stagingData) {
      processed++;
      
      try {
        const payload = record.raw_payload;
        const rowData = payload.row_data;
        const mapping = payload.mapping;
        const manualSource = payload.manual_source || 'direct';

        // Extract the mapped values
        const customerName = rowData[mapping.customer_name] || '';
        const startAt = rowData[mapping.start_at] || '';
        const endAt = rowData[mapping.end_at] || '';
        const customerEmail = rowData[mapping.customer_email] || '';
        const reference = rowData[mapping.reference] || '';
        const plate = rowData[mapping.plate] || '';

        // Validate required fields
        if (!customerName || !startAt || !endAt) {
          throw new Error(`Missing required fields: customerName=${customerName}, startAt=${startAt}, endAt=${endAt}`);
        }

        // Parse dates
        const startDate = new Date(startAt);
        const endDate = new Date(endAt);
        
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          throw new Error(`Invalid dates: startAt=${startAt}, endAt=${endAt}`);
        }

        // Insert the booking (only use columns that exist in the bookings table)
        const { data: bookingData, error: insertError } = await admin
          .from('bookings')
          .insert({
            tenant_id: tenantId,
            customer_name: customerName,
            customer_email: customerEmail || null,
            start_at: startDate.toISOString(),
            end_at: endDate.toISOString(),
            reference: reference || null,
            plate: plate || 'UNKNOWN', // Provide default value for NOT NULL constraint
            source: manualSource
          })
          .select('id')
          .single();

        if (insertError) {
          throw new Error(`Database insert failed: ${insertError.message}`);
        }

        // Update staging record to completed
        await admin
          .from('booking_import_staging')
          .update({ status: 'completed' })
          .eq('id', record.id);

        inserted++;

      } catch (error: any) {
        failed++;
        errors.push(`Record ${processed}: ${error.message}`);
        
        // Update staging record to failed
        await admin
          .from('booking_import_staging')
          .update({ status: 'failed' })
          .eq('id', record.id);
      }
    }

    console.log('✅ IMPORT_COMMIT_SUCCESS:', {
      tenantId,
      userId: user.id,
      processed,
      inserted,
      failed,
      errors: errors.slice(0, 5) // Log first 5 errors
    });

    return NextResponse.json({ 
      ok: true, 
      result: [{ processed, inserted, failed }],
      summary: { processed, inserted, failed },
      errors: errors.slice(0, 10) // Return first 10 errors
    });
  } catch (e: any) {
    console.error('❌ IMPORT_COMMIT_FATAL:', e);
    return NextResponse.json({ error: e?.message ?? 'Unknown error', details: e }, { status: 500 });
  }
}
