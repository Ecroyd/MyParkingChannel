import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET() {
  try {
    const admin = supabaseAdmin();
    
    // Test 1: Check if RPC function exists
    console.log('🔍 Testing RPC function existence...');
    const { data: rpcTest, error: rpcError } = await admin.rpc('booking_import_commit', {
      p_tenant_id: 'test',
      p_actor: 'test',
    });
    
    console.log('🔍 RPC test result:', { rpcTest, rpcError });
    
    // Test 2: Check staging table structure
    console.log('🔍 Testing staging table access...');
    const { data: stagingTest, error: stagingError } = await admin
      .from('booking_import_staging')
      .select('*')
      .limit(1);
    
    console.log('🔍 Staging table test:', { stagingTest, stagingError });
    
    return NextResponse.json({
      rpcTest: { data: rpcTest, error: rpcError?.message },
      stagingTest: { data: stagingTest, error: stagingError?.message },
      message: 'Check server logs for detailed output'
    });
  } catch (e: any) {
    console.error('❌ Import test error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
