import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const tenantId = formData.get('tenantId') as string;

    if (!file || !tenantId) {
      return NextResponse.json({ 
        error: 'File and tenant ID are required' 
      }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ 
        error: 'Please select an image file' 
      }, { status: 400 });
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ 
        error: 'File size must be less than 5MB' 
      }, { status: 400 });
    }

    const supabase = await getServerSupabase();
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ 
        error: 'Not authenticated' 
      }, { status: 401 });
    }

    // Verify user has access to this tenant using admin client to avoid RLS recursion
    const adminClientVerify = await createAdminClient();
    const { data: userTenant, error: accessError } = await adminClientVerify
      .from('user_tenants')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .single();

    if (accessError || !userTenant) {
      return NextResponse.json({ 
        error: 'You do not have access to this tenant' 
      }, { status: 403 });
    }

    const filePath = `${tenantId}/logo.png`;

    // Use admin client for storage operations to avoid RLS recursion
    const adminClient = await createAdminClient();

    // First, try to delete the existing logo if it exists
    try {
      const { error: deleteError } = await adminClient.storage
        .from('tenant-assets')
        .remove([filePath]);
      
      if (deleteError) {
        console.warn('Error deleting existing logo:', deleteError);
      } else {
        console.log('Successfully deleted existing logo');
      }
    } catch (deleteErr) {
      console.warn('Exception deleting existing logo:', deleteErr);
    }

    // Upload the new logo using admin client
    const { error: uploadError } = await adminClient.storage
      .from('tenant-assets')
      .upload(filePath, file, {
        cacheControl: '0', // No caching to ensure fresh content
        upsert: true,
        contentType: file.type,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json({ 
        error: `Upload failed: ${uploadError.message}` 
      }, { status: 500 });
    }

    console.log('Successfully uploaded new logo');

    // Get the public URL using admin client
    const { data } = adminClient.storage
      .from('tenant-assets')
      .getPublicUrl(filePath);

    // Add cache-busting parameter to ensure fresh content
    const logoUrl = `${data.publicUrl}?t=${Date.now()}`;

    return NextResponse.json({ 
      success: true,
      logoUrl: logoUrl
    });

  } catch (error: any) {
    console.error('Logo upload error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json({ 
        error: 'Tenant ID is required' 
      }, { status: 400 });
    }

    const supabase = await getServerSupabase();
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ 
        error: 'Not authenticated' 
      }, { status: 401 });
    }

    // Verify user has access to this tenant using admin client to avoid RLS recursion
    const adminClientVerify = await createAdminClient();
    const { data: userTenant, error: accessError } = await adminClientVerify
      .from('user_tenants')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .single();

    if (accessError || !userTenant) {
      return NextResponse.json({ 
        error: 'You do not have access to this tenant' 
      }, { status: 403 });
    }

    const filePath = `${tenantId}/logo.png`;

    // Use admin client for storage operations to avoid RLS recursion
    const adminClient = await createAdminClient();

    // Delete the logo using admin client
    const { error: deleteError } = await adminClient.storage
      .from('tenant-assets')
      .remove([filePath]);

    if (deleteError && deleteError.message !== 'Object not found') {
      return NextResponse.json({ 
        error: `Failed to remove logo: ${deleteError.message}` 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      message: 'Logo removed successfully' 
    });

  } catch (error: any) {
    console.error('Logo delete error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}
