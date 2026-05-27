/**
 * Decode Holiday Extras EXT*.txt attachment bytes (UTF-8 / UTF-16 / BOM).
 */
export function decodeExtAttachmentText(buffer: Buffer): string {
  if (buffer.length >= 2) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      return buffer.toString("utf16le").replace(/^\uFEFF/, "");
    }
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      return buffer.toString("utf16le").replace(/^\uFEFF/, "");
    }
  }
  let text = buffer.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  return text;
}
