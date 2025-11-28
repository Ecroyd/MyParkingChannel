// lib/supplier/types.ts

export type SupplierProduct = {
  id: string;
  code: string;
  name: string;
  description?: string;
  location?: {
    airport_code?: string;
    terminal?: string;
  };
  min_stay_hours?: number;
  max_stay_days?: number;
  lead_time_hours?: number;
  cancellation_policy?: {
    free_until_hours_before?: number;
    fee_percentage_after?: number;
  };
  features?: string[];
  currency: string;
  status: 'active' | 'inactive';
};

export type AvailabilityRequest = {
  product_id: string;
  start_at: string; // ISO
  end_at: string;   // ISO
  currency?: string;
  passengers?: number;
};

export type AvailabilityResponse = {
  product_id: string;
  start_at: string;
  end_at: string;
  currency: string;
  availability_status: 'available' | 'sold_out' | 'closed';
  remaining_capacity: number | null;
  pricing: {
    rate_plan: string;
    days: number;
    base_price: number;
    surcharges?: { code: string; description?: string; amount: number }[];
    discounts?: { code: string; description?: string; amount: number }[];
    total_price: number;
  };
};

export type BookingCreateRequest = {
  external_reference?: string;
  product_id: string;
  start_at: string;
  end_at: string;
  customer: {
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
  };
  vehicle: {
    plate: string;
    make?: string;
    model?: string;
    colour?: string;
  };
  flight?: {
    departure_number?: string;
    arrival_number?: string;
  };
  price: {
    currency: string;
    total: number;
  };
};

export type BookingCreateResponse = {
  reference: string;
  status: 'confirmed' | 'pending' | 'rejected';
  source: string;
  created_at: string;
};

