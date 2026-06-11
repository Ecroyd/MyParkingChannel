import { createAdminClient } from '@/lib/supabase/server-admin';
import { isBookingCapableFile, isImageFile } from '@/lib/ingest/fileTypeUtils';
import { isFileParseFailedForBanner } from '@/lib/ingest/ingestEmailFileStatus';
import { looksLikeFlyparksDirectEmail } from '@/lib/ingest/flyparksTextToStaging';

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
  unparsedReceivedGroups: Record<string, any[]>;
  summary: {
    failedCount: number;
    stuckPendingCount: number;
    emptyParsedCount: number;
    unparsedReceivedCount: number;
  };
}

function classifyUnparsedEmail(email: any): string {
  const subject = String(email.subject ?? '');
  const files = (email.ingest_email_files ?? []) as any[];
  const filenames = files.map((f) => String(f.filename ?? '').toLowerCase()).join(' ');
  const contentTypes = files.map((f) => String(f.content_type ?? '').toLowerCase()).join(' ');
  const haystack = `${subject} ${filenames} ${contentTypes}`;

  if (looksLikeFlyparksDirectEmail(subject, haystack)) return 'direct Flyparks text email';
  if (/ext\d|holiday\s*extras/i.test(haystack)) return 'Holiday Extras attachment';
  if (/\baph\b/i.test(haystack)) return 'APH attachment';
  if (/cavu|hourly|hourly order report/i.test(haystack)) return 'CAVU/hourly report';
  return 'unknown';
}

export async function getEmailParseHealth(tenantId: string): Promise<EmailParseHealthResult> {
  const adminClient = createAdminClient();

  const { data: allFailedFiles, error: failedError } = await adminClient
    .from('ingest_email_files')
    .select(`
      id, filename, parse_status, parse_outcome, parse_error, parsed_at, created_at,
      ingest_emails!inner(id, from_address, subject, created_at)
    `)
    .eq('parse_status', 'failed')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(100);

  const failedFiles = (allFailedFiles || []).filter((file: any) => {
    const fileTenantId = detectTenantFromEmail(file.ingest_emails);
    const matches = fileTenantId === tenantId;
    const isBookingCapable = isBookingCapableFile(file.filename);
    return matches && isBookingCapable && isFileParseFailedForBanner(file);
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
      id, filename, content_type, parse_status, parse_outcome, parse_reason, parsed_at, created_at,
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
        .select('id, inserted_count, error_count, created_at, profile_name, meta')
        .eq('tenant_id', tenantId)
        .gte('created_at', checkStart.toISOString())
        .lte('created_at', checkEnd.toISOString())
        .or(`profile_name.eq.${exactMatch},profile_name.ilike.%${escapedFilename}%`);
      if (importRuns?.length) {
        const exactMatchRun = importRuns.find((r: any) => r.profile_name === exactMatch);
        const successfulRun =
          exactMatchRun ||
          importRuns.find((r: any) => {
            const inserted = r.inserted_count || 0;
            const meta = r.meta as { updated?: number; cancelled_count?: number } | null;
            const updated = meta?.updated ?? 0;
            const cancelled = meta?.cancelled_count ?? 0;
            return inserted > 0 || updated > 0 || cancelled > 0;
          });
        if (successfulRun) {
          const meta = successfulRun.meta as { updated?: number; cancelled_count?: number } | null;
          const total =
            (successfulRun.inserted_count || 0) +
            (meta?.updated ?? 0) +
            (meta?.cancelled_count ?? 0);
          if (total > 0) {
            hasSuccessfulImportRun = true;
            bookingCount = total;
          }
        }
      }
    }

    const upsertedFromReason = (() => {
      const reason = file.parse_reason as string | null;
      if (!reason) return 0;
      const m = reason.match(/rows_upserted=(\d+)/);
      return m ? Number(m[1]) : 0;
    })();
    if (upsertedFromReason > 0) {
      hasSuccessfulImportRun = true;
      bookingCount = Math.max(bookingCount, upsertedFromReason);
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

    if (file.parse_outcome === 'empty' || ((stagingCount || 0) === 0 && bookingCount === 0)) {
      parsedWithIssues.push({
        ...file,
        staging_count: stagingCount || 0,
        booking_count: bookingCount,
      });
    }
  }

  const hasFailures = failedFiles.length > 0;
  const hasStuckPending = pendingFiles.length > 0;
  const hasEmptyParses = parsedWithIssues.length > 0;

  const { data: receivedEmails } = await adminClient
    .from('ingest_emails')
    .select(`
      id, from_address, to_address, subject, status, created_at,
      ingest_email_files(id, filename, content_type, parse_status, parse_outcome, parse_error, created_at),
      ingest_email_parses(id, parse_status, parse_error, parsed_at)
    `)
    .eq('status', 'received')
    .lt('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(100);

  const unparsedReceivedGroups: Record<string, any[]> = {
    'direct Flyparks text email': [],
    'Holiday Extras attachment': [],
    'APH attachment': [],
    'CAVU/hourly report': [],
    unknown: [],
  };

  for (const email of receivedEmails || []) {
    const emailTenantId = detectTenantFromEmail(email);
    if (emailTenantId !== tenantId) continue;
    const parses = (email as any).ingest_email_parses ?? [];
    const hasTerminalParse = parses.some((p: any) => p.parse_status === 'parsed' || p.parse_status === 'failed');
    if (hasTerminalParse) continue;
    const group = classifyUnparsedEmail(email);
    unparsedReceivedGroups[group].push(email);
  }

  const unparsedReceivedCount = Object.values(unparsedReceivedGroups).reduce(
    (sum, group) => sum + group.length,
    0
  );

  return {
    ok: true,
    hasIssues: hasFailures || hasStuckPending || hasEmptyParses || unparsedReceivedCount > 0,
    failedFiles,
    pendingFiles,
    emptyParsedFiles: parsedWithIssues,
    unparsedReceivedGroups,
    summary: {
      failedCount: failedFiles.length,
      stuckPendingCount: pendingFiles.length,
      emptyParsedCount: parsedWithIssues.length,
      unparsedReceivedCount,
    },
  };
}
