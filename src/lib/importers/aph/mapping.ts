/**
 * APH CSV mapping configuration
 * APH sends a 33-column, quoted, positional CSV (no headers)
 */
export const aphV1 = {
  delimiter: ",",
  hasHeaders: false,
  // APH is quoted positional CSV. We map by index (0-based).
  columns: {
    external_status: 1,
    external_reference: 2,
    start_date: 4,
    start_time: 11,
    end_date: 15,
    end_time: 16,
    return_flight_no: 17,
    customer_title: 5,
    customer_first_name: 6,     // best effort: may be initial
    customer_last_name: 21,
    customer_phone: 31,
    vehicle_reg: 7,
    vehicle_make: 8,
    vehicle_colour: 9,
    total_price: 13,
    product_code: 20,
    booked_date: 22,
    booked_time: 23,
  },
} as const;
