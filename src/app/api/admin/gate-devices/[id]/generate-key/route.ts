import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createServerClient } from '@/lib/supabase/server';
import { generateGateDeviceKeyPair } from '@/lib/devices/gateDeviceKeys';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deviceId } = await params;

    if (!deviceId) {
      return NextResponse.json({ error: 'Device ID is required' }, { status: 400 });
    }

    const supabase = await createServerClient();
    const adminClient = createAdminClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Fetch the device to verify it exists and get tenant_id
    const { data: device, error: deviceError } = await adminClient
      .from('gate_devices')
      .select('id, tenant_id, name')
      .eq('id', deviceId)
      .single();

    if (deviceError || !device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    // Verify user has access to this tenant
    const { data: userTenant } = await adminClient
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('tenant_id', device.tenant_id)
      .maybeSingle();

    if (!userTenant) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Generate new key pair
    const { rawKey, api_key_hash } = generateGateDeviceKeyPair();

    // Update device with new hash
    const { error: updateError } = await adminClient
      .from('gate_devices')
      .update({ api_key_hash })
      .eq('id', deviceId);

    if (updateError) {
      console.error('Error updating device key:', updateError);
      return NextResponse.json(
        { error: 'Failed to update device key' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      rawKey,
      message: 'Copy this API key now. It will not be shown again after you leave this page.',
    });
  } catch (error: any) {
    console.error('Generate key API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

