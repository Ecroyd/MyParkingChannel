/**
 * Validation schemas for platform integrations
 */

import { z } from 'zod';
import { INTEGRATION_PROVIDERS } from '@/lib/constants';

// Base integration config schema
const baseIntegrationSchema = z.object({
  provider: z.string().min(1, 'Provider is required'),
  config: z.record(z.any()),
});

// Email provider configs
const emailConfigSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  fromEmail: z.string().email('Invalid from email'),
  domain: z.string().optional(),
  host: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  port: z.number().optional(),
  secure: z.boolean().optional(),
});

// Parking provider configs
const parkingConfigSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  username: z.string().optional(),
  password: z.string().optional(),
  endpoint: z.string().url('Invalid endpoint URL').optional(),
});

// Complete integration schema
export const integrationSchema = z.object({
  provider: z.enum([
    INTEGRATION_PROVIDERS.EMAIL.RESEND,
    INTEGRATION_PROVIDERS.EMAIL.SENDGRID,
    INTEGRATION_PROVIDERS.EMAIL.POSTMARK,
    INTEGRATION_PROVIDERS.EMAIL.SMTP,
    INTEGRATION_PROVIDERS.PARKING.PARKVIA,
    INTEGRATION_PROVIDERS.PARKING.HOLIDAYEXTRAS,
  ]),
  config: z.union([emailConfigSchema, parkingConfigSchema]),
});

// API request/response schemas
export const createIntegrationSchema = integrationSchema;
export const updateIntegrationSchema = integrationSchema.partial();

export const integrationResponseSchema = z.object({
  id: z.string().uuid(),
  provider: z.string(),
  config: z.record(z.any()),
  created_at: z.string(),
  updated_at: z.string(),
});

export const integrationsListResponseSchema = z.object({
  integrations: z.array(integrationResponseSchema),
});

// Type exports
export type IntegrationInput = z.infer<typeof integrationSchema>;
export type CreateIntegrationInput = z.infer<typeof createIntegrationSchema>;
export type UpdateIntegrationInput = z.infer<typeof updateIntegrationSchema>;
export type IntegrationResponse = z.infer<typeof integrationResponseSchema>;
export type IntegrationsListResponse = z.infer<typeof integrationsListResponseSchema>;
