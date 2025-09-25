/**
 * GET /api/admin/integrations - List all integrations
 * POST /api/admin/integrations - Create/update integration
 * 
 * @server-only - Requires platform admin access
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/guards';
import { createIntegrationSchema, type CreateIntegrationInput, type IntegrationsListResponse } from '@/lib/validation/integrations';

export async function GET(request: NextRequest) {
  try {
    // Require platform admin access
    const { adminClient } = await requirePlatformAdmin();
    
    // Fetch all integrations
    const { data: integrations, error } = await adminClient
      .from('platform_integrations')
      .select('id, provider, config, created_at, updated_at')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching integrations:', error);
      return NextResponse.json(
        { error: { code: 'FETCH_FAILED', message: 'Failed to fetch integrations', details: error.message } },
        { status: 500 }
      );
    }
    
    const response: IntegrationsListResponse = {
      integrations: integrations || [],
    };
    
    return NextResponse.json(response);
    
  } catch (error: any) {
    console.error('Integrations GET error:', error);
    
    if (error.message.includes('Forbidden')) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Platform admin access required' } },
        { status: 403 }
      );
    }
    
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error', details: error.message } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Require platform admin access
    const { adminClient, user } = await requirePlatformAdmin();
    
    // Parse and validate request body
    const body = await request.json();
    const validatedData: CreateIntegrationInput = createIntegrationSchema.parse(body);
    
    const { provider, config } = validatedData;
    
    console.log('Creating/updating integration:', { provider });
    
    // Upsert integration (update if exists, create if not)
    const { data: integration, error } = await adminClient
      .from('platform_integrations')
      .upsert({
        provider,
        config,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'provider',
      })
      .select('id, provider, config, created_at, updated_at')
      .single();
    
    if (error) {
      console.error('Error upserting integration:', error);
      return NextResponse.json(
        { error: { code: 'UPSERT_FAILED', message: 'Failed to save integration', details: error.message } },
        { status: 500 }
      );
    }
    
    console.log('Integration saved successfully:', integration.id);
    
    return NextResponse.json({
      success: true,
      integration,
      message: `Integration for ${provider} saved successfully`,
    }, { status: 200 });
    
  } catch (error: any) {
    console.error('Integrations POST error:', error);
    
    if (error.message.includes('Forbidden')) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Platform admin access required' } },
        { status: 403 }
      );
    }
    
    // Handle validation errors
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: error.errors } },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error', details: error.message } },
      { status: 500 }
    );
  }
}
