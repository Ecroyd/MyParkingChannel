/**
 * Canonical booking format - unified shape for all import sources
 */
export type CanonicalBooking = {
  channel: "CAVU" | "APH" | "FLYPARKS_EMAIL" | "HOLIDAY_EXTRAS";
  booking_reference: string | null;
  third_party_reference: string | null;

  start_at: string | null; // ISO
  end_at: string | null;   // ISO

  vehicle_registration: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_colour: string | null;

  customer_firstname: string | null;
  customer_lastname: string | null;
  customer_email: string | null;
  customer_phone: string | null;

  outbound_flight_number: string | null;
  return_flight_number: string | null;

  total_price: number | null;
  currency: string | null;

  raw: any; // keep original fields
};
