import { createAdminClient } from '@/lib/supabase/server';

export interface CanaryHealthResult {
  status: 'ok' | 'down' | 'unknown';
  lastOk: string | null;
  ingestDown: boolean;
  lastError: string | null;
  token: string | null;
  processingDown: boolean;
  lastProcessedOk: string | null;
}

export async function getCanaryHealth(): Promise<CanaryHealthResult> {
  const supabaseAdmin = createAdminClient();
  const { data, error } = await supabaseAdmin
    .from('ingest_canary_health')
    .select('*')
    .single();

  if (error) throw error;
  if (!data) {
    return {
      status: 'unknown',
      lastOk: null,
      ingestDown: true,
      lastError: null,
      token: null,
      processingDown: true,
      lastProcessedOk: null,
    };
  }

  const ingestDown = data.ingest_down;
  const lastOk = data.last_received_at;
  const processingDown = data.processing_down;
  const lastProcessedOk = data.last_processed_at;
  const hasAnyRun = data.has_any_run === true;
  const status: 'ok' | 'down' | 'unknown' = !hasAnyRun ? 'unknown' : ingestDown ? 'down' : 'ok';

  return {
    status,
    lastOk: lastOk ?? null,
    ingestDown: ingestDown === true,
    lastError: data.last_error ?? null,
    token: data.token ?? null,
    processingDown: processingDown === true,
    lastProcessedOk: lastProcessedOk ?? null,
  };
}
