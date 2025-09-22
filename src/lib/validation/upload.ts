import { z } from 'zod'

export const uploadMappingSchema = z.object({
  reference: z.string(),
  customer_name: z.string(),
  customer_email: z.string(),
  plate: z.string(),
  start_at: z.string(),
  end_at: z.string(),
  car_make: z.string().optional(),
  car_model: z.string().optional(),
  car_color: z.string().optional(),
  money_charged: z.string().optional(),
  money_received: z.string().optional(),
  notes: z.string().optional()
})

export const uploadPreviewSchema = z.object({
  rows: z.array(z.record(z.string())),
  mapping: uploadMappingSchema
})

export type UploadMapping = z.infer<typeof uploadMappingSchema>
export type UploadPreview = z.infer<typeof uploadPreviewSchema>

