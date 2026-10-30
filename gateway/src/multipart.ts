// Incremental parser for the ISAPI alertStream: an endless multipart/mixed body whose parts
// are XML/JSON event notifications and JPEG snapshots. Chunks can split anywhere, so bytes
// are buffered until a whole part is available. Parts normally carry Content-Length; parts
// without one run up to the next boundary.

export type MultipartPart = {
  headers: Record<string, string>;
  body: Buffer;
};

const CRLF2 = Buffer.from('\r\n\r\n');
/** Safety valve: drop the buffer if a part never completes (corrupt stream). */
const MAX_BUFFER = 32 * 1024 * 1024;

export function boundaryFromContentType(contentType: string | null): string | null {
  const m = /boundary="?([^";]+)"?/i.exec(contentType ?? '');
  return m ? m[1].trim() : null;
}

export class MultipartParser {
  private buffer: Buffer = Buffer.alloc(0);
  private readonly delimiter: Buffer;

  constructor(boundary: string) {
    // Some firmware already includes the leading dashes in the boundary parameter.
    this.delimiter = Buffer.from(boundary.startsWith('--') ? boundary : `--${boundary}`);
  }

  /** Feed a chunk; returns every part completed by it. */
  push(chunk: Uint8Array): MultipartPart[] {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : Buffer.from(chunk);
    const parts: MultipartPart[] = [];

    for (;;) {
      const start = this.buffer.indexOf(this.delimiter);
      if (start === -1) {
        // Keep a tail long enough to hold a delimiter split across chunks.
        const keep = this.delimiter.length + 2;
        if (this.buffer.length > keep) this.buffer = this.buffer.subarray(this.buffer.length - keep);
        break;
      }

      const headerStart = start + this.delimiter.length;
      const headerEnd = this.buffer.indexOf(CRLF2, headerStart);
      if (headerEnd === -1) break;

      const headers = parseHeaders(this.buffer.subarray(headerStart, headerEnd).toString('latin1'));
      const bodyStart = headerEnd + CRLF2.length;
      const length = Number(headers['content-length']);

      let bodyEnd: number;
      let next: number;
      if (Number.isInteger(length) && length >= 0) {
        if (this.buffer.length < bodyStart + length) break;
        bodyEnd = bodyStart + length;
        next = bodyEnd;
      } else {
        const nextDelimiter = this.buffer.indexOf(this.delimiter, bodyStart);
        if (nextDelimiter === -1) break;
        bodyEnd = nextDelimiter;
        while (bodyEnd > bodyStart && (this.buffer[bodyEnd - 1] === 0x0a || this.buffer[bodyEnd - 1] === 0x0d)) {
          bodyEnd--;
        }
        next = nextDelimiter;
      }

      parts.push({ headers, body: Buffer.from(this.buffer.subarray(bodyStart, bodyEnd)) });
      this.buffer = this.buffer.subarray(next);
    }

    if (this.buffer.length > MAX_BUFFER) this.buffer = Buffer.alloc(0);
    return parts;
  }
}

function parseHeaders(block: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return headers;
}
