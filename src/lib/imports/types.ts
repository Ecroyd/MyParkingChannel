export type ImportProfileMap = {
  // column letters or 0-based indexes as strings
  source?: string;
  reference?: string;
  customer_name?: string; // Full name (optional, can be used instead of first/last)
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
  /** Naive tenant-local wall-clock "YYYY-MM-DDTHH:mm:ss"; the server applies the tenant timezone. */
  start_at: string;
  end_at: string;
  vehicle_reg: string;
  vehicle_colour: string;
  vehicle_make: string;
  vehicle_model: string;
  flight_number: string;
  phone: string;
  /** Raw status cell from the file; mapped to bookings.status on the server. "" = not given. */
  status: string;
  /** null = cell empty (on update: keep the existing amount). 0 is a real £0. */
  price: number | null;
  money_received: number | null;
  notes: string;
  _rawRow?: any[]; // Original raw row, only sent for Holiday Extras profiles (phone finder)
  /** 1-based row number in the uploaded file (for error reporting). */
  rowNumber?: number;
};
