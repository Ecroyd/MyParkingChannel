import { createAdminClient } from '@/lib/supabase/server-admin';
import { isBookingCapableFile, isImageFile } from '@/lib/ingest/fileTypeUtils';

function getEmailTenantMap(): Record<string, string> {
  if (process.env.EMAIL_TENANT_MAP) {
    try {
      return JSON.parse(process.env.EMAIL_TENANT_MAP);
    } catch (e) {
      console.error('[EMAIL PARSE HEALTH] Invalid EMAIL_TENANT_MAP JSON:', e);
    }
  }
  return {
    'jcecroyd@gmail.com': 'bab45dab-19e8-4230-b18e-ee1f663608e5',
    'info@flyparksexeter.co.uk': 'bab45dab-19e8-4230-b18e-ee1f663608e5',
    'eek_me@hotmail.com': 'bab45dab-19e8-4230-b18e-ee1f663608e5',
  };
}

function detectTenantFromEmail(email: { from_address?: string | null }): string | null {
  if (!email.from_address) return null;
  const map = getEmailTenantMap();
  const from = email.from_address.toLowerCase().trim();
  if (map[from]) return map[from];
  const domain = from.split('@')[1];
  if (domain && map[domain]) return map[domain];
  return null;
}

export interface EmailParseHealthResult {
  ok: true;
  hasIssues: boolean;
  failedFiles: any[];
  pendingFiles: any[];
  emptyParsedFiles: any[];
  summary: { failedCount: number; stuckPendingCount: number; emptyParsedCount: number };
}

export async function getEmailParseHealth(tenantId: string): Promise<EmailParseHealthResult> {
  const adminClient = createAdminClient();

  const { data: allFailedFiles, error: failedError } = await adminClient
    .from('ingest_email_files')
    .select(`
      id, filename, parse_status, parse_outcome, parse_error, parsed_at, created_at,
      ingest_emails!inner(id, from_address, subject, created_at)
    `)
    .eq('parse_outcome', 'failed')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(100);

  const failedFiles = (allFailedFiles || []).filter((file: any) => {
    const fileTenantId = detectTenantFromEmail(file.ingest_emails);
    const matches = fileTenantId === tenantId;
    const isBookingCapable = isBookingCapableFile(file.filename);
    return matches && isBookingCapable;
  }).slice(0, 50);

  if (failedError) throw new Error(failedError.message);

  const { data: allPendingFiles } = await adminClient
    .from('ingest_email_files')
    .select(`
      id, filename, parse_status, parsed_at, created_at,
      ingest_emails!inner(id, from_address, subject, created_at)
    `)
    .eq('parse_status', 'pending')
    .lt('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(50);

  const pendingFiles = (allPendingFiles || []).filter((file: any) => {
    const fileTenantId = detectTenantFromEmail(file.ingest_emails);
    const matches = fileTenantId === tenantId;
    if (matches && file.parsed_at) {
      const minutesSinceParse = (Date.now() - new Date(file.parsed_at).getTime()) / (1000 * 60);
      if (minutesSinceParse < 5) return false;
    }
    return matches;
  }).slice(0, 20);

  const { data: allParsedFiles } = await adminClient
    .from('ingest_email_files')
    .select(`
      id, filename, content_type, parse_status, parse_outcome, parsed_at, created_at,
      ingest_emails!inner(id, from_address, subject, created_at)
    `)
    .eq('parse_status', 'parsed')
    .gte('parsed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('parsed_at', { ascending: false })
    .limit(100);

  const parsedFiles = (allParsedFiles || []).filter((file: any) => {
    if (file.parse_outcome === 'skipped') return false;
    if (isImageFile(file.filename, file.content_type)) return false;
    const fileTenantId = detectTenantFromEmail(file.ingest_emails);
    return fileTenantId === tenantId;
  }).slice(0, 50);

  const parsedWithIssues: any[] = [];
  for (const file of parsedFiles) {
    const emailId = (file.ingest_emails as any).id;
    const { data: stagingRows, count: stagingCount } = await adminClient
      .from('booking_import_staging')
      .select('id, reference, vehicle_reg, start_at', { count: 'exact' })
      .eq('source_email_id', emailId)
      .eq('source_filename', file.filename);

    let bookingCount = 0;
    let hasSuccessfulImportRun = false;

    if (file.parsed_at) {
      const parsedTime = new Date(file.parsed_at);
      const checkStart = new Date(parsedTime.getTime() - 10 * 60 * 1000);
      const checkEnd = new Date(parsedTime.getTime() + 10 * 60 * 1000);
      const exactMatch = `Email import: ${file.filename}`;
      const escapedFilename = file.filename.replace(/%/g, '\\%').replace(/_/g, '\\_');
      const { data: importRuns } = await adminClient
        .from('import_runs')
        .select('id, inserted_count, error_count, created_at, profile_name')
        .eq('tenant_id', tenantId)
        .gte('created_at', checkStart.toISOString())
        .lte('created_at', checkEnd.toISOString())
        .or(`profile_name.eq.${exactMatch},profile_name.ilike.%${escapedFilename}%`);
      if (importRuns?.length) {
        const exactMatchRun = importRuns.find((r: any) => r.profile_name === exactMatch);
        const successfulRun = exactMatchRun || importRuns.find((r: any) => (r.inserted_count || 0) > 0);
        if (successfulRun && (successfulRun.inserted_count || 0) > 0) {
          hasSuccessfulImportRun = true;
          bookingCount = successfulRun.inserted_count || 0;
        }
      }
    }

    if (hasSuccessfulImportRun && bookingCount === 0 && stagingRows?.length) {
      const refs = [...new Set(stagingRows.map((s: any) => s.reference).filter(Boolean))];
      const plates = [...new Set(stagingRows.map((s: any) => s.vehicle_reg).filter(Boolean))];
      if (refs.length || plates.length) {
        const orCondition = refs.length && plates.length
          ? `reference.in.(${refs.join(',')}),plate.in.(${plates.join(',')})`
          : refs.length ? `reference.in.(${refs.join(',')})` : `plate.in.(${plates.join(',')})`;
        const { count: existingBookingCount } = await adminClient
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .or(orCondition);
        if (existingBookingCount && existingBookingCount > 0) bookingCount = existingBookingCount;
      }
    }

    if (!hasSuccessfulImportRun && stagingRows?.length) {
      const refs = [...new Set(stagingRows.map((s: any) => s.reference).filter(Boolean))];
      const plates = [...new Set(stagingRows.map((s: any) => s.vehicle_reg).filter(Boolean))];
      if (refs.length || plates.length) {
        const orCondition = refs.length && plates.length
          ? `reference.in.(${refs.join(',')}),plate.in.(${plates.join(',')})`
          : refs.length ? `reference.in.(${refs.join(',')})` : `plate.in.(${plates.join(',')})`;
        const { count } = await adminClient
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .or(orCondition);
        bookingCount = count || 0;
      }
    } else if (!hasSuccessfulImportRun && file.parsed_at) {
      const parsedTime = new Date(file.parsed_at);
      const checkStart = new Date(parsedTime.getTime() - 5 * 60 * 1000);
      const checkEnd = new Date(parsedTime.getTime() + 10 * 60 * 1000);
      const { count: recentBookingCount } = await adminClient
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', checkStart.toISOString())
        .lte('created_at', checkEnd.toISOString());
      bookingCount = recentBookingCount || 0;
    }

    if ((stagingCount || 0) === 0 && bookingCount === 0) {
      parsedWithIssues.push({ ...file, staging_count: stagingCount || 0, booking_count: bookingCount });
    }
  }

  const hasFailures = failedFiles.length > 0;
  const hasStuckPending = pendingFiles.length > 0;
  const hasEmptyParses = parsedWithIssues.length > 0;

  return {
    ok: true,
    hasIssues: hasFailures || hasStuckPending || hasEmptyParses,
    failedFiles,
    pendingFiles,
    emptyParsedFiles: parsedWithIssues,
    summary: {
      failedCount: failedFiles.length,
      stuckPendingCount: pendingFiles.length,
      emptyParsedCount: parsedWithIssues.length,
    },
  };
}
