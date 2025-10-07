import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

export async function POST(req: Request) {
  try {
    const { tenantId } = await req.json();

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID is required' }, { status: 400 });
    }

    const adminClient = await createAdminClient();

    // Find and delete mappings where customer_name is mapped to customer_title
    console.log('🔍 Looking for problematic mappings...');
    
    const { data: mappings, error: fetchError } = await adminClient
      .from('booking_import_mappings')
      .select('*')
      .eq('tenant_id', tenantId);
    
    if (fetchError) {
      console.error('❌ Error fetching mappings:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch mappings' }, { status: 500 });
    }
    
    console.log(`📊 Found ${mappings?.length || 0} mappings for tenant ${tenantId}`);
    
    // Look for problematic mappings
    const problematicMappings = mappings?.filter(mapping => {
      const mappingData = mapping.mapping;
      return mappingData?.customer_name === 'customer_title';
    });
    
    if (problematicMappings && problematicMappings.length > 0) {
      console.log(`🚨 Found ${problematicMappings.length} problematic mappings:`);
      problematicMappings.forEach(mapping => {
        console.log(`  - ID: ${mapping.id}, Name: ${mapping.name}, Customer Name: ${mapping.mapping?.customer_name}`);
      });
      
      // Delete the problematic mappings
      const mappingIds = problematicMappings.map(m => m.id);
      const { error: deleteError } = await adminClient
        .from('booking_import_mappings')
        .delete()
        .in('id', mappingIds);
      
      if (deleteError) {
        console.error('❌ Error deleting mappings:', deleteError);
        return NextResponse.json({ error: 'Failed to delete mappings' }, { status: 500 });
      }
      
      console.log('✅ Successfully deleted problematic mappings!');
      return NextResponse.json({ 
        success: true, 
        deletedCount: problematicMappings.length,
        deletedMappings: problematicMappings.map(m => ({ id: m.id, name: m.name }))
      });
    } else {
      console.log('✅ No problematic mappings found');
      return NextResponse.json({ 
        success: true, 
        message: 'No problematic mappings found',
        deletedCount: 0
      });
    }
    
  } catch (error) {
    console.error('❌ Delete mapping error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
