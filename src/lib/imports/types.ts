export type ImportProfileMap = {
  // column letters or 0-based indexes as strings
  source?: string;
  reference?: string;
  customer_lastname?: string;
  customer_title?: string;
  customer_firstname?: string;

  // choose either (single timestamp) or (date+time) for start/end
  start_timestamp?: string;
  start_date?: string;
  start_time?: string;

  end_timestamp?: string;
  end_date?: string;
  end_time?: string;

  vehicle_reg?: string;
  vehicle_colour?: string;
  vehicle_make?: string;
  vehicle_model?: string;

  flight_number?: string;
  phone?: string;
  status?: string;
  price?: string;
  money_received?: string;
  notes?: string;
};

export type CanonicalBooking = {
  source: string;
  reference: string;
  customer_name: string;
  customer_lastname: string;
  customer_title: string;
  customer_firstname: string;
  start_at: string; // ISO
  end_at: string;   // ISO
  vehicle_reg: string;
  vehicle_colour: string;
  vehicle_make: string;
  vehicle_model: string;
  flight_number: string;
  phone: string;
  status: string;
  price: number | null;
  money_received: number | null;
  notes: string;
};
