import { describe, expect, it } from 'vitest';
import { parsePictureKind, picturePath, sniffImageType } from '../pictures';

describe('anpr pictures', () => {
  it('builds a per-tenant, per-day path', () => {
    expect(picturePath('t1', 'e1', '2026-11-20T12:26:53Z', 'plate', 'image/jpeg')).toBe('t1/2026-11-20/e1-plate.jpg');
    expect(picturePath('t1', 'e1', '2026-11-20T12:26:53Z', 'scene', 'image/png')).toBe('t1/2026-11-20/e1-scene.png');
  });

  it('only accepts real JPEG or PNG bytes', () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffImageType(new TextEncoder().encode('<html>'))).toBeNull();
  });

  it('parses the kind', () => {
    expect(parsePictureKind('plate')).toBe('plate');
    expect(parsePictureKind('other')).toBeNull();
  });
});
