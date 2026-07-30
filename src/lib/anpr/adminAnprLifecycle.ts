/**
 * ANPR admin lifecycle + client fetch orchestration (testable, no React).
 */

export const ANPR_EVENT_POLL_MS = 30_000;
export const ANPR_DEVICE_POLL_MS = 60_000;
/** Live monitoring must never poll faster than this for events. */
export const ANPR_MIN_EVENT_POLL_MS = 30_000;

export type AnprLifecycleState =
  | 'not_configured'
  | 'configured_disabled'
  | 'enabled_disconnected'
  | 'enabled_connected';

export type AnprConfigSummary = {
  enabled: boolean;
  ingest_method?: string | null;
  videofit_api_url?: string | null;
  videofit_username?: string | null;
  videofit_base_url?: string | null;
  videofit_mode?: string | null;
  has_credentials?: boolean;
  has_relay_token?: boolean;
  offline_after_minutes?: number | null;
  default_group?: string | null;
  camera_direction_map?: Record<string, string> | null;
};

export type AnprDeviceSummary = {
  id: string;
  name: string;
  status: string;
  last_seen: string | null;
};

export function isAnprConfigured(config: AnprConfigSummary | null | undefined): boolean {
  if (!config) return false;
  if (config.has_credentials || config.has_relay_token) return true;
  if (config.ingest_method && config.ingest_method.trim()) return true;
  if (config.videofit_api_url || config.videofit_base_url) return true;
  if (config.videofit_username) return true;
  if (config.videofit_mode === 'direct' || config.videofit_mode === 'relay') {
    // mode alone with other empty fields still counts as "touched" if enabled was ever set —
    // prefer stronger signals; treat mode-only as not configured.
  }
  const map = config.camera_direction_map;
  if (map && Object.keys(map).length > 0) return true;
  return false;
}

export function resolveAnprLifecycleState(
  config: AnprConfigSummary | null | undefined,
  devices: AnprDeviceSummary[] = [],
  nowMs: number = Date.now()
): AnprLifecycleState {
  if (!config?.enabled) {
    return isAnprConfigured(config) ? 'configured_disabled' : 'not_configured';
  }

  const offlineAfterMin = config.offline_after_minutes ?? 15;
  const thresholdMs = offlineAfterMin * 60_000;
  const hasRecentHeartbeat = devices.some((d) => {
    if (!d.last_seen) return false;
    const seen = new Date(d.last_seen).getTime();
    return Number.isFinite(seen) && nowMs - seen <= thresholdMs;
  });

  return hasRecentHeartbeat ? 'enabled_connected' : 'enabled_disconnected';
}

export type AnprPollGate = {
  enabled: boolean;
  liveMonitoring: boolean;
  visibilityState: DocumentVisibilityState | 'hidden' | 'visible';
  inFlight: boolean;
};

export function canPollAnprEvents(gate: AnprPollGate): boolean {
  if (!gate.enabled) return false;
  if (!gate.liveMonitoring) return false;
  if (gate.visibilityState === 'hidden') return false;
  if (gate.inFlight) return false;
  return true;
}

export function canPollAnprDevices(gate: AnprPollGate): boolean {
  return canPollAnprEvents(gate);
}

export function assertEventPollInterval(ms: number): void {
  if (ms < ANPR_MIN_EVENT_POLL_MS) {
    throw new Error(`ANPR event poll interval must be >= ${ANPR_MIN_EVENT_POLL_MS}ms`);
  }
}

/**
 * Tracks in-flight ANPR requests; aborts previous on new start; rejects stale.
 */
export class AnprRequestController {
  private abortController: AbortController | null = null;
  private sequence = 0;
  private _inFlight = false;
  private intervals: Array<ReturnType<typeof setInterval> | number> = [];

  get inFlight(): boolean {
    return this._inFlight;
  }

  abortInFlight(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this._inFlight = false;
  }

  clearIntervals(): void {
    for (const id of this.intervals) clearInterval(id);
    this.intervals = [];
  }

  /** Stop everything — used when ANPR is disabled. */
  disable(): void {
    this.clearIntervals();
    this.abortInFlight();
  }

  trackInterval(id: ReturnType<typeof setInterval> | number): void {
    this.intervals.push(id);
  }

  async run<T>(
    execute: (signal: AbortSignal) => Promise<T>
  ): Promise<{ ok: true; data: T; sequence: number } | { ok: false; reason: 'aborted' | 'stale' }> {
    this.abortInFlight();
    const controller = new AbortController();
    this.abortController = controller;
    const sequence = ++this.sequence;
    this._inFlight = true;

    try {
      const data = await execute(controller.signal);
      if (sequence !== this.sequence || controller.signal.aborted) {
        return { ok: false, reason: sequence !== this.sequence ? 'stale' : 'aborted' };
      }
      return { ok: true, data, sequence };
    } catch (err) {
      if (
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError')
      ) {
        return { ok: false, reason: 'aborted' };
      }
      throw err;
    } finally {
      if (this.abortController === controller) {
        this._inFlight = false;
        this.abortController = null;
      }
    }
  }
}
