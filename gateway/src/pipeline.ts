// Read → /capture payload: decide the direction and build the request body.

import type { Direction, GatewayConfig } from './config.ts';
import type { AnprRead } from './anprEvent.ts';
import type { CapturePayload } from './queue.ts';

export function resolveDirection(
  read: AnprRead,
  config: Pick<GatewayConfig, 'channelDirections' | 'cameraDirections'>
): Direction | null {
  if (read.cameraDirection) {
    const fromCamera = config.cameraDirections.get(read.cameraDirection);
    if (fromCamera) return fromCamera;
  }
  return config.channelDirections.get(read.channelId.toLowerCase()) ?? null;
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
