// Turn one alertStream notification (XML EventNotificationAlert or its JSON equivalent) into
// a plate read. Anything that is not a plate read — heartbeats, motion, video loss, "inactive"
// states, unreadable plates — returns null.

export type AnprRead = {
  plate: string;
  plateNorm: string;
  channelId: string;
  channelName: string | null;
  occurredAt: string;
  /** The camera's own travel direction, when it reports one. */
  cameraDirection: 'forward' | 'reverse' | null;
  /** 0..1 */
  confidence: number | null;
  eventType: string;
  /** Small, image-free summary kept with the gate event for debugging. */
  raw: Record<string, string>;
};

const UNREADABLE = new Set(['', 'UNKNOWN', 'NOPLATE', 'NONE']);

export function normalizePlate(plate: string): string {
  return plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** First <name>…</name> (any namespace prefix or attributes), text only. */
function xmlTag(xml: string, name: string): string | null {
  const re = new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([^<]*)</(?:\\w+:)?${name}>`, 'i');
  const m = re.exec(xml);
  return m ? m[1].trim() : null;
}

function jsonField(obj: unknown, names: string[]): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const record = obj as Record<string, unknown>;
  for (const name of names) {
    const key = Object.keys(record).find((k) => k.toLowerCase() === name.toLowerCase());
    const value = key ? record[key] : undefined;
    if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  }
  return null;
}

type Fields = {
  eventType: string | null;
  eventState: string | null;
  channelId: string | null;
  channelName: string | null;
  dateTime: string | null;
  plate: string | null;
  direction: string | null;
  confidence: string | null;
  vehicleType: string | null;
  plateColor: string | null;
};

function fieldsFromXml(xml: string): Fields {
  return {
    eventType: xmlTag(xml, 'eventType'),
    eventState: xmlTag(xml, 'eventState'),
    channelId: xmlTag(xml, 'channelID') ?? xmlTag(xml, 'dynChannelID'),
    channelName: xmlTag(xml, 'channelName'),
    dateTime: xmlTag(xml, 'dateTime'),
    plate: xmlTag(xml, 'licensePlate'),
    direction: xmlTag(xml, 'direction'),
    confidence: xmlTag(xml, 'confidenceLevel'),
    vehicleType: xmlTag(xml, 'vehicleType'),
    plateColor: xmlTag(xml, 'plateColor'),
  };
}

function fieldsFromJson(text: string): Fields | null {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return null;
  }
  const root = (doc as Record<string, unknown>)?.EventNotificationAlert ?? doc;
  const anpr =
    (root as Record<string, unknown>)?.ANPR ??
    (root as Record<string, unknown>)?.anpr ??
    (root as Record<string, unknown>)?.VehicleInfo ??
    root;
  return {
    eventType: jsonField(root, ['eventType']),
    eventState: jsonField(root, ['eventState']),
    channelId: jsonField(root, ['channelID', 'dynChannelID']),
    channelName: jsonField(root, ['channelName']),
    dateTime: jsonField(root, ['dateTime']),
    plate: jsonField(anpr, ['licensePlate', 'plateNo']),
    direction: jsonField(anpr, ['direction']),
    confidence: jsonField(anpr, ['confidenceLevel', 'confidence']),
    vehicleType: jsonField(anpr, ['vehicleType']),
    plateColor: jsonField(anpr, ['plateColor']),
  };
}

export function parseAnprNotification(text: string, receivedAt: Date = new Date()): AnprRead | null {
  const trimmed = text.trim();
  const fields = trimmed.startsWith('{') ? fieldsFromJson(trimmed) : fieldsFromXml(trimmed);
  if (!fields?.plate) return null;
  if (fields.eventState && fields.eventState.toLowerCase() === 'inactive') return null;

  const plateNorm = normalizePlate(fields.plate);
  if (UNREADABLE.has(plateNorm)) return null;

  const parsed = fields.dateTime ? new Date(fields.dateTime) : null;
  const occurredAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : receivedAt;

  const dir = fields.direction?.toLowerCase();
  const cameraDirection = dir === 'forward' ? 'forward' : dir === 'reverse' ? 'reverse' : null;

  const level = fields.confidence === null ? NaN : Number(fields.confidence);
  const confidence = Number.isFinite(level) ? Math.max(0, Math.min(1, level > 1 ? level / 100 : level)) : null;

  const raw: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) if (value) raw[key] = value;

  return {
    plate: fields.plate.trim(),
    plateNorm,
    channelId: fields.channelId ?? 'unknown',
    channelName: fields.channelName,
    occurredAt: occurredAt.toISOString(),
    cameraDirection,
    confidence,
    eventType: fields.eventType ?? 'unknown',
    raw,
  };
}
