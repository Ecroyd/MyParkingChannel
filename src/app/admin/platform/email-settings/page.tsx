import { redirect } from 'next/navigation';
import { requirePlatformAdmin } from '@/lib/guards';
import PlatformEmailSettingsClient from './PlatformEmailSettingsClient';

export default async function PlatformEmailSettingsPage() {
  try {
    const { adminClient } = await requirePlatformAdmin();

    // Fetch current email provider settings
    const { data: settings } = await adminClient
      .from('email_provider_settings')
      .select('*')
      .eq('provider', 'resend')
      .maybeSingle();

    return (
      <PlatformEmailSettingsClient initialSettings={settings || null} />
    );
  } catch (error: any) {
    if (error.message?.includes('Forbidden') || error.message?.includes('Not authenticated')) {
      redirect('/admin');
    }
    throw error;
  }
}
