export type BookingMapping = {
  reference: string | null;
  plate: string | null;
  start_at: string | null;
  end_at: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  money_received?: string | null;
  money_charged?: string | null;
  source?: string | null;
  flight_number?: string | null;
  transforms?: { 
    plateUppercase?: boolean; 
    dateTz?: string; 
  };
};

export type SavedMapping = {
  id: string;
  name: string;
  mapping: BookingMapping;
  header_signature: string;
  sample_headers: string[];
  confidence: number;
  created_at: string;
  last_used_at: string;
};

export type MappingSuggestion = {
  match: 'exact' | 'fuzzy';
  mapping: BookingMapping;
  confidence: number;
  name: string;
  id: string;
  header_signature: string;
};

/**
 * Normalize a header string for consistent comparison
 * - Convert to lowercase
 * - Replace non-alphanumeric chars with spaces
 * - Collapse multiple spaces
 */
export const normalizeHeader = (h: string): string =>
  h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

/**
 * Create a stable signature from CSV headers
 * - Normalize each header
 * - Sort alphabetically for consistency
 * - Join with pipe separator
 */
export const headerSignature = (headers: string[]): string =>
  headers.map(normalizeHeader).sort().join("|");

/**
 * Find the best mapping for a given header signature
 * 1. Try exact match first
 * 2. Fall back to fuzzy similarity search
 */
export async function findBestMapping(
  supabase: any, 
  tenantId: string, 
  signature: string
): Promise<MappingSuggestion | null> {
  // 1) Exact match
  const { data: exact } = await supabase
    .from("booking_import_mappings")
    .select("id,name,mapping,header_signature,confidence")
    .eq("tenant_id", tenantId)
    .eq("header_signature", signature)
    .limit(1);

  if (exact?.length) {
    return { 
      match: "exact", 
      ...exact[0], 
      confidence: 1.0 
    };
  }

  // 2) Fuzzy match using pg_trgm similarity
  const { data: fuzzy, error } = await supabase
    .rpc("booking_mapping_similar", { 
      p_tenant_id: tenantId, 
      p_sig: signature, 
      p_limit: 3 
    });

  if (error) {
    console.warn("Fuzzy matching failed:", error);
    return null;
  }

  if (fuzzy?.length && fuzzy[0].confidence >= 0.6) {
    return { 
      match: "fuzzy", 
      ...fuzzy[0] 
    };
  }

  return null;
}

/**
 * Save or update a mapping with learning
 */
export async function saveMapping(
  supabase: any,
  tenantId: string,
  userId: string,
  name: string,
  headers: string[],
  mapping: BookingMapping,
  confidence: number = 1.0
): Promise<void> {
  const signature = headerSignature(headers);
  
  const { error } = await supabase
    .from("booking_import_mappings")
    .upsert({
      tenant_id: tenantId,
      name,
      header_signature: signature,
      sample_headers: headers,
      mapping,
      confidence,
      created_by: userId,
      last_used_at: new Date().toISOString()
    }, { 
      onConflict: 'tenant_id,header_signature',
      ignoreDuplicates: false 
    });

  if (error) {
    throw new Error(`Failed to save mapping: ${error.message}`);
  }
}

/**
 * Update last_used_at when a mapping is applied
 */
export async function markMappingUsed(
  supabase: any,
  mappingId: string
): Promise<void> {
  await supabase
    .from("booking_import_mappings")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", mappingId);
}

/**
 * Auto-guess field mappings based on header aliases
 */
export const AUTO_GUESS_ALIASES = {
  reference: ["Booking ID","Reference","Ref","ID","Booking Reference","Booking Ref"],
  plate: ["VRM","Vehicle Registration","Reg","Plate","Registration","Car Plate","License Plate"],
  start_at: ["Arrival Date","Start","Arrival","Start Date","Check In","Check-in","Arrival Time","From Date"],
  end_at: ["Departure Date","End","Departure","End Date","Check Out","Check-out","Departure Time","To Date"],
  customer_name: ["Customer Name","Name","Full Name","Customer","Client Name","Passenger Name"],
  customer_email: ["Customer Email","Email","Email Address","Contact Email","E-mail"],
  money_received: ["Money Received","Paid","Amount Received","Payment","Total Paid","Amount Paid"],
  money_charged: ["Money Charged","Charge","Price","Total","Amount Charged","Cost","Fee"],
  source: ["Source","Channel","Provider","Booking Source","Origin","Platform"],
  flight_number: ["Flight","Flight Number","Flight No","Flight Number","Flight Code","Flight ID"]
};

export function autoGuessMapping(headers: string[]): BookingMapping {
  const mapping: BookingMapping = {
    reference: null,
    plate: null,
    start_at: null,
    end_at: null,
  };
  
  for (const [field, aliases] of Object.entries(AUTO_GUESS_ALIASES)) {
    const found = headers.find(h => 
      aliases.some(alias => 
        h.toLowerCase().includes(alias.toLowerCase()) || 
        alias.toLowerCase().includes(h.toLowerCase())
      )
    );
    if (found) {
      (mapping as any)[field] = found;
    }
  }
  
  return mapping;
}

/**
 * Calculate confidence based on how many required fields are mapped
 */
export function calculateMappingConfidence(mapping: BookingMapping): number {
  const required = ['reference', 'plate', 'start_at', 'end_at'];
  const mapped = required.filter(field => mapping[field as keyof BookingMapping]);
  return mapped.length / required.length;
}
