// Cron job endpoint for APH SFTP rate exports
// This endpoint should be secured with a secret token/header

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { runAphExportForChannel } from '@/lib/integrations/aph/job';

export const runtime = 'nodejs'; // ensure Node runtime

/**
 * GET /api/admin/jobs/aph/export
 * Cron job endpoint to export APH rates for all enabled tenants
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = req.headers.get('x-cron-secret');

  if (!cronSecret || headerSecret !== cronSecret) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const supabase = createAdminClient();

  // Get all APH channels that are enabled
  const { data: channels, error } = await supabase
    .from('tenant_integration_channels')
    .select('id, config, enabled, provider')
    .eq('provider', 'aph_sftp')
    .eq('enabled', true);

  if (error) {
    console.error('[APH][EXPORT] Failed to fetch channels', error);
    return NextResponse.json({ ok: false, error: 'Failed to load channels' }, { status: 500 });
  }

  const now = new Date();

  // Simple scheduling: only run if enough minutes have passed since last export
  const tasks: Promise<void>[] = [];

  for (const channel of channels ?? []) {
    const config = channel.config as any;
    // Support both old and new config formats
    const freqMinutes: number = config?.send_frequency_minutes ?? config?.sendFrequencyMinutes ?? 60;

    // Check last export time from aph_rate_exports table
    const { data: lastExport } = await supabase
      .from('aph_rate_exports')
      .select('ran_at')
      .eq('channel_id', channel.id)
      .eq('status', 'success')
      .order('ran_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastExport) {
      const last = new Date(lastExport.ran_at);
      const diffMinutes = (now.getTime() - last.getTime()) / 60000;
      if (diffMinutes < freqMinutes) {
        console.log(
          `[APH][EXPORT] Skipping channel ${channel.id} - last export was ${diffMinutes.toFixed(1)} minutes ago (frequency: ${freqMinutes} min)`
        );
        continue;
      }
    }

    tasks.push(runAphExportForChannel(channel.id));
  }

  // Run in parallel but don't await them one-by-one
  await Promise.all(tasks);

  return NextResponse.json({ ok: true, processed: tasks.length });
}

