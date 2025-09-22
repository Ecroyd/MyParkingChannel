import { z } from 'zod'

export const RowIn = z.object({
  booking_id: z.string().optional(),
  reference: z.string().optional(),
  customer_name: z.string().optional(),
  customer_email: z.string().optional(),
  phone: z.string().optional(),

  plate: z.string().optional(),
  car_make: z.string().optional(),
  car_model: z.string().optional(),
  car_color: z.string().optional(),

  flight_number: z.string().optional(),

  arrival_date: z.string().optional(),
  arrival_time: z.string().optional(),
  departure_date: z.string().optional(),
  departure_time: z.string().optional(),

  status: z.string().optional(),
  money_received: z.union([z.string(), z.number()]).optional(),
  money_charged: z.union([z.string(), z.number()]).optional(),

  source: z.string().optional(),
  created_date: z.string().optional(),
})

export type RowIn = z.infer<typeof RowIn>

const headerAliases: Record<string, keyof RowIn> = {
  // left: csv headers (lowercased, stripped), right: canonical key
  'bookingid': 'booking_id',
  'booking id': 'booking_id',
  'reference': 'reference',

  'customername': 'customer_name',
  'customer name': 'customer_name',
  'email': 'customer_email',
  'customeremail': 'customer_email',
  'phone': 'phone',

  'vehicleregistration': 'plate',
  'vehicle registration': 'plate',
  'reg': 'plate',
  'plate': 'plate',

  'carmake': 'car_make',
  'car make': 'car_make',
  'carmodel': 'car_model',
  'car model': 'car_model',
  'carcolor': 'car_color',
  'car color': 'car_color',

  'flightnumber': 'flight_number',
  'flight number': 'flight_number',

  'arrivaldate': 'arrival_date',
  'arrival date': 'arrival_date',
  'arrivaltime': 'arrival_time',
  'arrival time': 'arrival_time',

  'departuredate': 'departure_date',
  'departure date': 'departure_date',
  'departuretime': 'departure_time',
  'departure time': 'departure_time',

  'status': 'status',
  'moneyreceived': 'money_received',
  'money received': 'money_received',
  'moneycharged': 'money_charged',
  'money charged': 'money_charged',

  'source': 'source',
  'createddate': 'created_date',
  'created date': 'created_date',
}

export function canonicaliseHeader(h: string): keyof RowIn | undefined {
  const k = h.trim().toLowerCase().replace(/\s+/g, ' ')
  const compact = k.replace(/\s+/g, '')
  return headerAliases[k] ?? headerAliases[compact]
}

export function parseMoney(x?: string | number | null): number | null {
  if (x === undefined || x === null) return null
  if (typeof x === 'number') return Number.isFinite(x) ? x : null
  const s = x.toString().trim()
  if (!s) return null
  const cleaned = s.replace(/[£,]/g, '')
  const val = Number(cleaned)
  return Number.isFinite(val) ? Math.round(val * 100) / 100 : null
}

// dd/mm/yyyy or yyyy-mm-dd; times like "14:30" or blank
function parseDateTime(dateStr?: string | null, timeStr?: string | null): Date | null {
  if (!dateStr || !dateStr.trim()) return null
  const d = dateStr.trim()
  let day: number, month: number, year: number
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) {
    const [dd, mm, yyyy] = d.split('/')
    day = Number(dd); month = Number(mm); year = Number(yyyy)
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [yyyy, mm, dd] = d.split('-')
    day = Number(dd); month = Number(mm); year = Number(yyyy)
  } else {
    const dt = new Date(d)
    if (!isNaN(dt.getTime())) return dt
    return null
  }

  let hours = 12, minutes = 0
  if (timeStr && timeStr.trim()) {
    const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})/)
    if (m) { hours = Number(m[1]); minutes = Number(m[2]) }
  }

  // Treat as Europe/London local -> convert to ISO by app runtime
  return new Date(Date.UTC(year, month - 1, day, hours, minutes))
}

export function mapCsvRowToBooking(row: Record<string, any>) {
  // Map headers -> canonical keys
  const mapped: Partial<RowIn> = {}
  for (const [rawHeader, value] of Object.entries(row)) {
    const key = canonicaliseHeader(rawHeader)
    if (key) mapped[key] = (value ?? '').toString().trim()
  }
  
  // Parse with error handling
  let safe: RowIn
  try {
    safe = RowIn.parse(mapped)
  } catch (error) {
    console.warn('CSV row validation error:', error, 'for row:', mapped)
    // Return a safe default row
    safe = {
      customer_email: mapped.customer_email || null,
      customer_name: mapped.customer_name || null,
      plate: mapped.plate || null,
      reference: mapped.reference || null,
    } as RowIn
  }

  const startAt = parseDateTime(safe.arrival_date ?? null, safe.arrival_time ?? null)
  const endAt   = parseDateTime(safe.departure_date ?? null, safe.departure_time ?? null)
  const createdAt = parseDateTime(safe.created_date ?? null, null)

  const moneyReceived = parseMoney(safe.money_received ?? null)
  const moneyCharged  = parseMoney(safe.money_charged ?? null)

  // Basic status mapping
  const statusMap: Record<string, string> = {
    'confirmed':'confirmed', 'complete':'completed', 'completed':'completed',
    'cancelled':'cancelled', 'canceled':'cancelled', 'pending':'pending', '': 'pending'
  }
  const status = statusMap[(safe.status ?? '').toLowerCase()] ?? 'pending'

  return {
    customer_email: safe.customer_email || null,
    customer_name:  safe.customer_name  || null,
    phone:          safe.phone          || null,

    plate:       safe.plate       || null,
    car_make:    safe.car_make    || null,
    car_model:   safe.car_model   || null,
    car_color:   safe.car_color   || null,
    flight_number: safe.flight_number || null,

    start_at: startAt ? new Date(startAt).toISOString() : null,
    end_at:   endAt   ? new Date(endAt).toISOString()   : null,

    status,
    money_received: moneyReceived,
    money_charged:  moneyCharged,

    source:    safe.source    || 'CSV',
    reference: safe.reference || safe.booking_id || null,

    created_at: createdAt ? new Date(createdAt).toISOString() : undefined,
  }
}

