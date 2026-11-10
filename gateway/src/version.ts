// The gateway's own version. Keep it equal to package.json "version"; releases are tagged
// gateway-v<this> (the release workflow refuses a tag that does not match) and auto-update
// compares against it.

export const GATEWAY_VERSION = '0.2.0';

/** "0.10.1" > "0.9.3". Missing or malformed parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}
