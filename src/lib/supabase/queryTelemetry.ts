/**
 * Temporary privacy-safe Supabase/PostgREST query telemetry for egress investigation.
 *
 * Enable with:
 *   SUPABASE_QUERY_TELEMETRY=1          (server)
 *   NEXT_PUBLIC_SUPABASE_QUERY_TELEMETRY=1  (browser + server)
 *
 * Never logs row contents, emails, PII, or booking personal data — only metadata.
 */

export type QueryTelemetryContext = {
  route?: string;
  component?: string;
  queryName?: string;
};

export type QueryTelemetryEvent = {
  queryName: string;
  tableOrRpc: string;
  rowCount: number | null;
  approxResponseBytes: number;
  durationMs: number;
  timestamp: string;
  routeOrComponent: string;
  method?: string;
  status?: number;
  source?: string;
};

type AlsStore = QueryTelemetryContext;

const globalForTelemetry = globalThis as typeof globalThis & {
  __pcQueryTelemetryAls?: { getStore: () => AlsStore | undefined; run: <T>(s: AlsStore, fn: () => T) => T };
};

function getAls(): { getStore: () => AlsStore | undefined; run: <T>(s: AlsStore, fn: () => T) => T } | null {
  if (typeof window !== 'undefined') return null;
  if (globalForTelemetry.__pcQueryTelemetryAls) return globalForTelemetry.__pcQueryTelemetryAls;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AsyncLocalStorage } = require('async_hooks') as typeof import('async_hooks');
    const als = new AsyncLocalStorage<AlsStore>();
    globalForTelemetry.__pcQueryTelemetryAls = {
      getStore: () => als.getStore(),
      run: (store, fn) => als.run(store, fn),
    };
    return globalForTelemetry.__pcQueryTelemetryAls;
  } catch {
    return null;
  }
}

export function isQueryTelemetryEnabled(): boolean {
  return (
    process.env.SUPABASE_QUERY_TELEMETRY === '1' ||
    process.env.NEXT_PUBLIC_SUPABASE_QUERY_TELEMETRY === '1'
  );
}

export function withQueryTelemetryContext<T>(ctx: QueryTelemetryContext, fn: () => T): T {
  const als = getAls();
  if (!als) return fn();
  const parent = als.getStore() ?? {};
  return als.run({ ...parent, ...ctx }, fn);
}

export function getQueryTelemetryContext(): QueryTelemetryContext {
  return getAls()?.getStore() ?? {};
}

export function approxJsonBytes(data: unknown): number {
  try {
    const json = JSON.stringify(data ?? null);
    if (typeof Buffer !== 'undefined') {
      return Buffer.byteLength(json, 'utf8');
    }
    return new TextEncoder().encode(json).length;
  } catch {
    return 0;
  }
}

function countRows(data: unknown): number | null {
  if (data == null) return 0;
  if (Array.isArray(data)) return data.length;
  if (typeof data === 'object') return 1;
  return null;
}

function parseRestTarget(url: string): { tableOrRpc: string; queryName: string } | null {
  try {
    const u = new URL(url);
    // /rest/v1/bookings or /rest/v1/rpc/fn_name
    const match = u.pathname.match(/\/rest\/v1\/(?:rpc\/([^/?]+)|([^/?]+))/);
    if (!match) return null;
    if (match[1]) {
      return { tableOrRpc: `rpc:${match[1]}`, queryName: `rpc:${match[1]}` };
    }
    return { tableOrRpc: match[2], queryName: `from:${match[2]}` };
  } catch {
    return null;
  }
}

function resolveRouteOrComponent(explicit?: string, source?: string): string {
  const ctx = getQueryTelemetryContext();
  if (explicit) return explicit;
  if (ctx.route || ctx.component) {
    return [ctx.route, ctx.component].filter(Boolean).join(' / ');
  }
  if (typeof window !== 'undefined') {
    return `browser:${window.location.pathname}`;
  }
  return source ? `client:${source}` : 'unknown';
}

/** Manual telemetry for helpers that already hold `data` (never pass PII-bearing intent beyond size). */
export function logQueryTelemetry(input: {
  queryName: string;
  tableOrRpc: string;
  data: unknown;
  durationMs: number;
  routeOrComponent?: string;
  source?: string;
}): void {
  if (!isQueryTelemetryEnabled()) return;

  const event: QueryTelemetryEvent = {
    queryName: input.queryName,
    tableOrRpc: input.tableOrRpc,
    rowCount: countRows(input.data),
    approxResponseBytes: approxJsonBytes(input.data),
    durationMs: Math.round(input.durationMs),
    timestamp: new Date().toISOString(),
    routeOrComponent: resolveRouteOrComponent(input.routeOrComponent, input.source),
    source: input.source,
  };

  // Structured single-line log — metadata only
  console.info('[supabase-query-telemetry]', JSON.stringify(event));
}

/**
 * Wrap fetch used by supabase-js clients. Measures PostgREST response size without
 * logging body contents. Non-REST requests pass through unchanged.
 */
export function createTelemetryFetch(
  source: string,
  baseFetch: typeof fetch = fetch
): typeof fetch {
  const wrapped: typeof fetch = async (input, init) => {
    if (!isQueryTelemetryEnabled()) {
      return baseFetch(input, init);
    }

    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const target = parseRestTarget(url);
    if (!target) {
      return baseFetch(input, init);
    }

    const method = (init?.method ?? (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET') ?? 'GET').toUpperCase();
    const ctx = getQueryTelemetryContext();
    const queryName = ctx.queryName ?? `${method} ${target.queryName}`;
    const started = performance.now();

    const response = await baseFetch(input, init);
    const durationMs = performance.now() - started;

    // Read body once, measure, rebuild Response for supabase-js
    let approxResponseBytes = 0;
    let rowCount: number | null = null;
    let rebuild: Response = response;

    try {
      const text = await response.text();
      approxResponseBytes =
        typeof Buffer !== 'undefined'
          ? Buffer.byteLength(text, 'utf8')
          : new TextEncoder().encode(text).length;

      if (text && (text.startsWith('[') || text.startsWith('{'))) {
        try {
          rowCount = countRows(JSON.parse(text));
        } catch {
          rowCount = null;
        }
      } else if (method === 'HEAD' || text === '') {
        const contentRange = response.headers.get('content-range');
        // e.g. "0-9/123" or "*/123"
        const total = contentRange?.split('/')?.[1];
        if (total && total !== '*') {
          const n = Number(total);
          rowCount = Number.isFinite(n) ? n : null;
        } else {
          rowCount = 0;
        }
      }

      rebuild = new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch {
      // If body cannot be read, still emit duration/status without size
      rebuild = response;
    }

    const event: QueryTelemetryEvent = {
      queryName,
      tableOrRpc: target.tableOrRpc,
      rowCount,
      approxResponseBytes,
      durationMs: Math.round(durationMs),
      timestamp: new Date().toISOString(),
      routeOrComponent: resolveRouteOrComponent(undefined, source),
      method,
      status: response.status,
      source,
    };

    console.info('[supabase-query-telemetry]', JSON.stringify(event));
    return rebuild;
  };

  return wrapped;
}

export function telemetryClientOptions(source: string): {
  global: { fetch: typeof fetch };
} {
  return {
    global: {
      fetch: createTelemetryFetch(source),
    },
  };
}
