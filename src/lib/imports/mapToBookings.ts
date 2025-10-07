// Map status to valid enum values
function mapStatusToEnum(status?: string): 'reserved' | 'checked_in' | 'checked_out' | 'cancelled' {
  if (!status) return 'reserved';
  const lower = status.toLowerCase();
  if (lower.includes('cancelled') || lower.includes('canx') || lower.includes('cancel')) return 'cancelled';
  if (lower.includes('checked_out') || lower.includes('dep') || lower.includes('out')) return 'checked_out';
  if (lower.includes('checked_in') || lower.includes('arr') || lower.includes('in')) return 'checked_in';
  if (lower.includes('amended') || lower.includes('amnd')) return 'reserved'; // Treat amended as reserved
  return 'reserved'; // Default for any other status
}

// Map staging table data to actual bookings table format
export function mapStagingToBookings(stagingRecord: any) {
  return {
    tenant_id: stagingRecord.tenant_id,
    reference: stagingRecord.reference,
    customer_name: stagingRecord.customer_name,
    customer_email: '', // Default empty, can be populated later
    plate: stagingRecord.vehicle_reg,
    car_make: stagingRecord.vehicle_make,
    car_model: stagingRecord.vehicle_model,
    car_color: stagingRecord.vehicle_colour,
    start_at: stagingRecord.start_at,
    end_at: stagingRecord.end_at,
    status: mapStatusToEnum(stagingRecord.status),
    money_charged: stagingRecord.price || 0,
    money_received: stagingRecord.money_received || 0,
    notes: stagingRecord.notes || '',
    source: stagingRecord.source, // Source is already mapped in the UI
    flight_number: stagingRecord.flight_number,
    dedupe_key: stagingRecord.dedupe_key,
    is_incomplete: false,
    missing_fields: []
  };
}
