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
 * Log request attribution for cron/health routes so Vercel logs show
 * user-agent, referer, IP, cf-ray (Cloudflare). Use to identify what's
 * hammering at 8am (monitoring, bots, browser tabs).
 */
export function logRequestAttribution(req: Request, pathOverride?: string): void {
  const url = req.url;
  const path = pathOverride ?? (url ? new URL(url).pathname : '');
  const ua = req.headers.get('user-agent') ?? '';
  const referer = req.headers.get('referer') ?? '';
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const cf = req.headers.get('cf-ray') ?? '';
  console.log('[HIT]', {
    path,
    ua,
    referer,
    ip,
    cf,
    at: new Date().toISOString(),
  });
}
