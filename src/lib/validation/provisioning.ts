// src/lib/validation/provisioning.ts
import { z } from 'zod';

export const provisionTenantSchema = z.object({
  tenant: z.object({
    name: z.string().min(2).max(120),
    slug: z.string().regex(/^[a-z0-9-]{3,40}$/),
    timezone: z.string().min(2),
    capacity: z.number().int().nonnegative(),
  }),
  owner: z.object({
    email: z.string().email(),
    invite: z.boolean().default(true),
  }),
});
export type ProvisionTenantInput = z.infer<typeof provisionTenantSchema>;

export const assignOwnerSchema = z.object({
  tenantId: z.string().uuid(),
  ownerEmail: z.string().email(),
  invite: z.boolean().default(true),
});
export type AssignOwnerInput = z.infer<typeof assignOwnerSchema>;