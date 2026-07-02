/** Columns needed for Today ops board list rows (not modal detail). */
export const TODAY_BOOKING_SELECT =
  'id, tenant_id, reference, customer_name, customer_email, customer_phone, plate, car_make, car_model, car_color, start_at, end_at, start_at_local, end_at_local, status, money_received, money_charged, source, flight_number, notes, stripe_payment_intent_id, checked_in_at, checked_out_at, arrived_at, departed_at, gate_status, highlight_code, ops_status, ops_hidden, ops_hidden_reason';

export type TodayBookingRow = {
  id: string;
  tenant_id: string;
  reference: string;
  customer_name: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  plate: string | null;
  car_make?: string | null;
  car_model?: string | null;
  car_color?: string | null;
  start_at: string;
  end_at: string;
  start_at_local?: string | null;
  end_at_local?: string | null;
  status: string | null;
  money_received?: number | null;
  money_charged?: number | null;
  source?: string | null;
  flight_number?: string | null;
  notes?: string | null;
  stripe_payment_intent_id?: string | null;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
  arrived_at?: string | null;
  departed_at?: string | null;
  gate_status?: string | null;
  highlight_code?: string | null;
  ops_status?: string | null;
  ops_hidden?: boolean | null;
  ops_hidden_reason?: string | null;
};
