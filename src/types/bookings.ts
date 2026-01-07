export type BookingHighlightCode =
  | 'none'
  | 'dot_green'
  | 'dot_amber'
  | 'dot_red'
  | 'key';

export interface Booking {
  id: string;
  tenant_id: string;
  reference: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  plate: string;
  car_make: string | null;
  car_model: string | null;
  car_color: string | null;
  start_at: string;
  end_at: string;
  status: string;
  money_received: number;
  money_charged: number | null;
  source: string;
  flight_number: string | null;
  notes: string | null;
  stripe_payment_intent_id?: string | null;
  payment_status?: string | null;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
  gate_status?: string | null;
  highlight_code: BookingHighlightCode;
}











