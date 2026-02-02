import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/guards';

export async function POST(req: NextRequest) {
  try {
    const { adminClient } = await requirePlatformAdmin();
    const body = await req.json();

    const {
      resend_api_key,
      default_from_email,
      default_from_name,
      default_reply_to,
      is_enabled,
    } = body;

    // Validate required fields
    if (!default_from_email || !default_from_name) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Encrypt API key (simple base64 for now - can be enhanced)
    let resend_api_key_encrypted = '';
    if (resend_api_key) {
      resend_api_key_encrypted = Buffer.from(resend_api_key).toString('base64');
    } else {
      // Get existing encrypted key if not updating
      const { data: existing } = await adminClient
        .from('email_provider_settings')
        .select('resend_api_key_encrypted')
        .eq('provider', 'resend')
        .maybeSingle();
      
      if (!existing) {
        return NextResponse.json(
          { success: false, error: 'API key required for initial setup' },
          { status: 400 }
        );
      }
      
      resend_api_key_encrypted = existing.resend_api_key_encrypted;
    }

    // Upsert single row for provider='resend' (unique index email_provider_settings_provider_key)
    const { error: upsertError } = await adminClient
      .from('email_provider_settings')
      .upsert(
        {
          provider: 'resend',
          resend_api_key_encrypted,
          default_from_email,
          default_from_name,
          default_reply_to: default_reply_to ?? null,
          is_enabled: is_enabled ?? true,
        },
        { onConflict: 'provider' }
      );

    if (upsertError) {
      console.error('[PLATFORM EMAIL SETTINGS] Upsert error:', upsertError);
      return NextResponse.json(
        { success: false, error: upsertError.message },
        { status: 500 }
      );
    }

    // Re-fetch persisted row to return (do not expose resend_api_key_encrypted)
    const { data: saved, error: fetchError } = await adminClient
      .from('email_provider_settings')
      .select('default_from_email, default_from_name, default_reply_to, is_enabled')
      .eq('provider', 'resend')
      .single();

    if (fetchError) {
      console.error('[PLATFORM EMAIL SETTINGS] Fetch after save:', fetchError);
      return NextResponse.json(
        { success: false, error: fetchError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      settings: {
        default_from_email: saved?.default_from_email ?? default_from_email,
        default_from_name: saved?.default_from_name ?? default_from_name,
        default_reply_to: saved?.default_reply_to ?? default_reply_to ?? null,
        is_enabled: saved?.is_enabled ?? is_enabled,
      },
    });
  } catch (error: any) {
    if (error.message?.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }
    console.error('[PLATFORM EMAIL SETTINGS] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
