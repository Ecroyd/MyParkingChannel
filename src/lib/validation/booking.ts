import { z } from 'zod'

export const bookingSchema = z.object({
  reference: z.string().min(1, 'Reference is required'),
  customer_id: z.string().uuid().optional(),
  customer_name: z.string().min(1, 'Customer name is required'),
  customer_email: z.string().email('Invalid email address'),
  plate: z.string().optional(),
  car_make: z.string().optional(),
  car_model: z.string().optional(),
  car_color: z.string().optional(),
  start_at: z.string().datetime('Invalid start date'),
  end_at: z.string().datetime('Invalid end date'),
  status: z.enum(['reserved', 'checked_in', 'checked_out', 'cancelled', 'no_show']).default('reserved'),
  money_charged: z.number().min(0).default(0),
  money_received: z.number().min(0).default(0),
  notes: z.string().optional(),
  source: z.enum(['direct', 'parkvia', 'holidayextras', 'manual', 'other']).default('manual')
})

export const bookingUpdateSchema = bookingSchema.partial().omit({ reference: true })

export type BookingInput = z.infer<typeof bookingSchema>
export type BookingUpdate = z.infer<typeof bookingUpdateSchema>

