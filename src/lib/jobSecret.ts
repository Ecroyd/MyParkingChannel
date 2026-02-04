/**
 * Shared guard for cron/job endpoints. Stops bots, browser calls, and accidental
 * public access. Set JOB_SECRET in env; schedulers (Cloudflare, GitHub Actions, etc.)
 * send header: x-job-secret: <value>.
 * Later: can move to tenant_secrets per-tenant and look up by tenant.
 */

export function getExpectedJobSecret(): string | undefined {
  return process.env.JOB_SECRET?.trim() || undefined;
}

export function validateJobSecret(req: Request): boolean {
  const expected = getExpectedJobSecret();
  if (!expected) return false;
  const provided = req.headers.get('x-job-secret')?.trim();
  return !!provided && provided === expected;
}

/**
 * Log request attribution for cron/health routes (optional). No-op by default;
 * set DEBUG_HIT=1 in env to enable logging for debugging.
 */
export function logRequestAttribution(_req: Request, _pathOverride?: string): void {
  if (process.env.DEBUG_HIT !== '1') return;
  const url = _req.url;
  const path = _pathOverride ?? (url ? new URL(url).pathname : '');
  const ua = _req.headers.get('user-agent') ?? '';
  const referer = _req.headers.get('referer') ?? '';
  const ip = _req.headers.get('x-forwarded-for') ?? _req.headers.get('x-real-ip') ?? '';
  const cf = _req.headers.get('cf-ray') ?? '';
  console.log('[HIT]', { path, ua, referer, ip, cf, at: new Date().toISOString() });
}
