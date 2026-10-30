// Drop repeat reads of the same plate on the same channel within a window. The cameras have
// "Remove Duplicated License Plates" switched off, so a car waiting at the barrier is read
// several times; /capture only de-duplicates exact (same-second) repeats.

export class ReadDeduper {
  private readonly lastSeen = new Map<string, number>();
  private readonly windowMs: number;

  constructor(windowSeconds: number) {
    this.windowMs = windowSeconds * 1000;
  }

  /** True when the read should be kept; records it either way. */
  accept(plateNorm: string, channelId: string, atMs: number): boolean {
    const key = `${channelId}|${plateNorm}`;
    const previous = this.lastSeen.get(key);
    this.lastSeen.set(key, atMs);
    this.prune(atMs);
    return previous === undefined || Math.abs(atMs - previous) > this.windowMs;
  }

  private prune(nowMs: number): void {
    if (this.lastSeen.size < 1000) return;
    for (const [key, at] of this.lastSeen) {
      if (nowMs - at > this.windowMs) this.lastSeen.delete(key);
    }
  }
}
