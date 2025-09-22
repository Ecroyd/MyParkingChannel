type BookingInsertShape = {
  reference?: string
  customer_name?: string | null
  customer_email?: string | null
  plate?: string | null
  start_at?: string
  end_at?: string
  notes?: string
  source?: 'manual' | 'direct' | 'parkvia' | 'holidayextras' | 'other'
  flight_number?: string | null
}

const ALIAS = {
  reference: ['reference','booking_reference','booking ref','booking id','bookingid','ref','id'],
  customer_name: ['customer name','name','customer','full name'],
  first_name: ['first name','firstname','forename','givenname'],
  last_name:  ['last name','lastname','surname','familyname'],
  email: ['email','email address','customer email'],
  plate: ['plate','vehicle registration','vehicle reg','registration','reg','vrm'],
  start_date: ['start','start date','arrival','arrival date','drop-off date','checkin date','arrival_date'],
  start_time: ['start time','arrival time','drop-off time','checkin time','arrival_time'],
  end_date:   ['end','end date','departure','departure date','pickup date','checkout date','departure_date'],
  end_time:   ['end time','departure time','pickup time','checkout time','departure_time'],
  notes: ['notes','comments','remarks'],
  source: ['source','channel'],
  flight_number: ['flight number','flight','flight_no','flightno','flight num','flight_number'],
} as const

function find(row: Record<string, any>, aliases: readonly string[]): string | undefined {
  for (const alias of aliases) {
    const value = row[alias]
    if (value !== undefined && value !== null && value !== '') {
      return String(value).trim()
    }
  }
  return undefined
}

function normalizeHeaders(row: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {}
  for (const [key, value] of Object.entries(row)) {
    const lowerKey = key.toLowerCase().trim()
    normalized[lowerKey] = value
  }
  return normalized
}

function buildISO(dateStr: string, timeStr: string): string | undefined {
  if (!dateStr) return undefined
  
  try {
    let date: Date
    
    // Try parsing as ISO date first
    if (dateStr.includes('T') || dateStr.includes('Z')) {
      date = new Date(dateStr)
    } else {
      // Try common date formats
      const formats = [
        /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
        /^\d{2}\/\d{2}\/\d{4}$/, // MM/DD/YYYY
        /^\d{2}-\d{2}-\d{4}$/, // MM-DD-YYYY
        /^\d{1,2}\/\d{1,2}\/\d{4}$/, // M/D/YYYY
      ]
      
      if (formats.some(f => f.test(dateStr))) {
        date = new Date(dateStr)
      } else {
        // Try parsing as-is
        date = new Date(dateStr)
      }
    }
    
    if (isNaN(date.getTime())) return undefined
    
    // Add time if provided
    if (timeStr) {
      const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/)
      if (timeMatch) {
        const hours = parseInt(timeMatch[1])
        const minutes = parseInt(timeMatch[2])
        const seconds = timeMatch[3] ? parseInt(timeMatch[3]) : 0
        date.setHours(hours, minutes, seconds)
      }
    }
    
    return date.toISOString()
  } catch {
    return undefined
  }
}

function toEnumSource(source?: string): 'manual' | 'direct' | 'parkvia' | 'holidayextras' | 'other' {
  if (!source) return 'direct'
  const lower = source.toLowerCase()
  if (lower.includes('parkvia')) return 'parkvia'
  if (lower.includes('holiday') || lower.includes('extras')) return 'holidayextras'
  if (lower.includes('manual')) return 'manual'
  return 'other'
}

export function mapCsvRowToBookingFlex(input: Record<string, any>): {
  normalized: BookingInsertShape,
  missing: string[]
} {
  const row = normalizeHeaders(input)
  const ref   = find(row, ALIAS.reference)
  const first = find(row, ALIAS.first_name)
  const last  = find(row, ALIAS.last_name)
  const name  = find(row, ALIAS.customer_name) || [first, last].filter(Boolean).join(' ').trim() || null
  const email = (find(row, ALIAS.email) as string | undefined)?.toLowerCase() || null
  const plate = (find(row, ALIAS.plate) as string | undefined)?.toUpperCase().replace(/\s+/g,'') || null

  const sDate = find(row, ALIAS.start_date)
  const sTime = find(row, ALIAS.start_time)
  const eDate = find(row, ALIAS.end_date)
  const eTime = find(row, ALIAS.end_time)

  const startISO = buildISO(String(sDate || ''), String(sTime || ''))
  const endISO   = buildISO(String(eDate || ''), String(eTime || ''))

  const flight = (find(row, ALIAS.flight_number) as string | undefined)?.toUpperCase() || null

  const normalized: BookingInsertShape = {
    reference: ref ? String(ref) : undefined,
    customer_name: name,
    customer_email: email,
    plate,
    start_at: startISO || undefined,
    end_at: endISO || undefined,
    notes: (find(row, ALIAS.notes) as string) || undefined,
    source: toEnumSource(find(row, ALIAS.source) as string),
    flight_number: flight,
  }

  const missing: string[] = []
  if (!normalized.reference) missing.push('reference')
  if (!normalized.start_at)  missing.push('start_at')
  if (!normalized.end_at)    missing.push('end_at')
  if (!normalized.plate)     missing.push('plate')
  if (!normalized.customer_email) missing.push('customer_email')
  if (!normalized.customer_name)  missing.push('customer_name')

  return { normalized, missing }
}

