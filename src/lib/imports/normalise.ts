export function mapStatus(raw: string): string {
  const s = (raw || "").toUpperCase();
  if (s.includes("CANX")) return "cancelled";
  if (s.includes("AMND")) return "amended";
  return "reserved";
}
