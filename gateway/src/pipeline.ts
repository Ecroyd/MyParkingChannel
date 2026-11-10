// Read → /capture payload: decide the direction and build the request body.

import type { Direction, GatewayConfig } from './config.ts';
import type { AnprRead } from './anprEvent.ts';
import type { CapturePayload } from './queue.ts';

/** How often each camera has reported each travel direction (new reads only). */
export type DirectionCounts = Record<string, { forward: number; reverse: number }>;

const LEARN_MIN_READS = 10;
const LEARN_MAJORITY = 3;

/** The direction a camera reports for its normal traffic, once it has clearly shown one. */
export function usualCameraDirection(c: { forward: number; reverse: number } | undefined): 'forward' | 'reverse' | null {
  if (!c || c.forward + c.reverse < LEARN_MIN_READS) return null;
  if (c.forward >= LEARN_MAJORITY * c.reverse) return 'forward';
  if (c.reverse >= LEARN_MAJORITY * c.forward) return 'reverse';
  return null;
}

/** Count a read's travel direction against its camera, halving old counts so it keeps adapting. */
export function countDirection(counts: DirectionCounts, read: AnprRead): void {
  if (!read.cameraDirection) return;
  const c = (counts[read.channelId] ??= { forward: 0, reverse: 0 });
  c[read.cameraDirection]++;
  if (c.forward + c.reverse > 1000) {
    c.forward = Math.floor(c.forward / 2);
    c.reverse = Math.floor(c.reverse / 2);
  }
}

export function resolveDirection(
  read: AnprRead,
  config: Pick<GatewayConfig, 'channelDirections' | 'cameraDirections'>,
  counts?: DirectionCounts
): Direction | null {
  if (read.cameraDirection) {
    const fromCamera = config.cameraDirections.get(read.cameraDirection);
    if (fromCamera) return fromCamera;
  }
  const channel = config.channelDirections.get(read.channelId.toLowerCase()) ?? null;
  if (!channel || !read.cameraDirection) return channel;

  // A car going the wrong way through a barrier (in through the exit, out through the entrance)
  // shows the opposite travel direction to that camera's normal traffic.
  const usual = usualCameraDirection(counts?.[read.channelId]);
  if (usual) return read.cameraDirection === usual ? channel : channel === 'in' ? 'out' : 'in';

  // Until a camera has shown its normal direction: exit cameras report leaving cars as "forward"
  // (seen at Fly Parks Exeter), so "reverse" there is a car coming in.
  if (channel === 'out' && read.cameraDirection === 'reverse') return 'in';
  return channel;
}

export function toCapturePayload(
  read: AnprRead,
  direction: Direction,
  config: Pick<GatewayConfig, 'deviceId'>
): CapturePayload {
  return {
    plate: read.plate,
    occurred_at: read.occurredAt,
    direction,
    camera_id: read.channelName ? `${read.channelId}:${read.channelName}` : read.channelId,
    lane: null,
    confidence: read.confidence,
    source: 'hikvision',
    ...(config.deviceId ? { device_id: config.deviceId } : {}),
    raw: read.raw,
  };
}
