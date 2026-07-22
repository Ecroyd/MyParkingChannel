import type { SiteRedirect } from "./types";

const UNSAFE_EXTERNAL_HOST_RE =
  /^(javascript:|data:|vbscript:|file:)/i;

export type RedirectValidationError =
  | "self_redirect"
  | "duplicate_old_path"
  | "unsafe_destination"
  | "invalid_old_path"
  | "invalid_new_path"
  | "redirect_loop"
  | "invalid_status";

export function normalizeRedirectPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "/";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const u = new URL(trimmed);
      return u.pathname + u.search || "/";
    } catch {
      return trimmed;
    }
  }
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/{2,}/g, "/") || "/";
}

export function isExternalRedirectTarget(target: string): boolean {
  return /^https?:\/\//i.test(target.trim());
}

export function isUnsafeRedirectDestination(target: string): boolean {
  const t = target.trim();
  if (UNSAFE_EXTERNAL_HOST_RE.test(t)) return true;
  if (isExternalRedirectTarget(t)) {
    try {
      const u = new URL(t);
      if (!["http:", "https:"].includes(u.protocol)) return true;
      // Disallow obvious phishing to localhost etc. in production configs — allow relative only preferred
      return false;
    } catch {
      return true;
    }
  }
  // Relative paths must start with /
  if (!t.startsWith("/")) return true;
  return false;
}

/**
 * Detect a redirect loop starting from `oldPath` within the active map.
 */
export function detectRedirectLoop(
  redirects: Array<Pick<SiteRedirect, "old_path" | "new_path" | "active">>,
  startOldPath: string,
  startNewPath: string
): boolean {
  const map = new Map<string, string>();
  for (const r of redirects) {
    if (r.active === false) continue;
    map.set(normalizeRedirectPath(r.old_path), normalizeRedirectPath(r.new_path));
  }
  map.set(normalizeRedirectPath(startOldPath), normalizeRedirectPath(startNewPath));

  let current = normalizeRedirectPath(startOldPath);
  const seen = new Set<string>();
  for (let i = 0; i < 20; i++) {
    if (seen.has(current)) return true;
    seen.add(current);
    const next = map.get(current);
    if (!next) return false;
    if (isExternalRedirectTarget(next)) return false;
    current = next;
  }
  return true;
}

export function previewRedirectChain(
  redirects: Array<Pick<SiteRedirect, "old_path" | "new_path" | "active" | "status_code">>,
  startPath: string,
  maxHops = 10
): { chain: string[]; loop: boolean; finalPath: string; statusCodes: number[] } {
  const map = new Map<string, { to: string; code: number }>();
  for (const r of redirects) {
    if (r.active === false) continue;
    map.set(normalizeRedirectPath(r.old_path), {
      to: normalizeRedirectPath(r.new_path),
      code: r.status_code,
    });
  }

  const chain: string[] = [normalizeRedirectPath(startPath)];
  const statusCodes: number[] = [];
  const seen = new Set<string>([chain[0]]);
  let current = chain[0];

  for (let i = 0; i < maxHops; i++) {
    const hit = map.get(current);
    if (!hit) break;
    statusCodes.push(hit.code);
    if (isExternalRedirectTarget(hit.to)) {
      chain.push(hit.to);
      break;
    }
    if (seen.has(hit.to)) {
      chain.push(hit.to);
      return { chain, loop: true, finalPath: hit.to, statusCodes };
    }
    seen.add(hit.to);
    chain.push(hit.to);
    current = hit.to;
  }

  return { chain, loop: false, finalPath: chain[chain.length - 1], statusCodes };
}

export function validateRedirectInput(args: {
  oldPath: string;
  newPath: string;
  statusCode: number;
  existing: Array<Pick<SiteRedirect, "id" | "old_path" | "new_path" | "active">>;
  excludeId?: string;
}): { ok: true } | { ok: false; error: RedirectValidationError; message: string } {
  const oldPath = normalizeRedirectPath(args.oldPath);
  const newPath = args.newPath.trim();

  if (!oldPath.startsWith("/")) {
    return { ok: false, error: "invalid_old_path", message: "Old path must start with /" };
  }
  if (!newPath) {
    return { ok: false, error: "invalid_new_path", message: "New path is required" };
  }
  if (isUnsafeRedirectDestination(newPath)) {
    return {
      ok: false,
      error: "unsafe_destination",
      message: "Destination must be a relative path or http(s) URL",
    };
  }
  if (![301, 302].includes(args.statusCode)) {
    return { ok: false, error: "invalid_status", message: "Status must be 301 or 302" };
  }

  const normalizedNew = isExternalRedirectTarget(newPath)
    ? newPath
    : normalizeRedirectPath(newPath);

  if (!isExternalRedirectTarget(normalizedNew) && oldPath === normalizedNew) {
    return { ok: false, error: "self_redirect", message: "Cannot redirect a path to itself" };
  }

  const duplicate = args.existing.find(
    (r) =>
      r.id !== args.excludeId &&
      normalizeRedirectPath(r.old_path) === oldPath
  );
  if (duplicate) {
    return {
      ok: false,
      error: "duplicate_old_path",
      message: "A redirect already exists for this old path",
    };
  }

  if (
    detectRedirectLoop(
      args.existing.filter((r) => r.id !== args.excludeId),
      oldPath,
      normalizedNew
    )
  ) {
    return { ok: false, error: "redirect_loop", message: "This redirect would create a loop" };
  }

  return { ok: true };
}

/**
 * Resolve the first matching active redirect for a request path.
 */
export function resolveRedirect(
  redirects: Array<Pick<SiteRedirect, "old_path" | "new_path" | "status_code" | "active">>,
  requestPath: string
): { to: string; status: 301 | 302 } | null {
  const path = normalizeRedirectPath(requestPath);
  const hit = redirects.find(
    (r) => r.active !== false && normalizeRedirectPath(r.old_path) === path
  );
  if (!hit) return null;
  const status = (hit.status_code === 302 ? 302 : 301) as 301 | 302;
  return { to: hit.new_path, status };
}
