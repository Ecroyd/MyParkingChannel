/**
 * Application constants and configuration
 */

export const APP_NAME = 'My Parking Channel';
export const DEFAULT_TIMEZONE = 'Europe/London';

// Timezone options for tenant selection
export const TIMEZONE_OPTIONS = [
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Dublin', label: 'Dublin (GMT/IST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { value: 'Europe/Madrid', label: 'Madrid (CET/CEST)' },
  { value: 'Europe/Rome', label: 'Rome (CET/CEST)' },
  { value: 'America/New_York', label: 'New York (EST/EDT)' },
  { value: 'America/Chicago', label: 'Chicago (CST/CDT)' },
  { value: 'America/Denver', label: 'Denver (MST/MDT)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
  { value: 'Australia/Melbourne', label: 'Melbourne (AEST/AEDT)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
] as const;

// Default tenant capacity
export const DEFAULT_TENANT_CAPACITY = 100;

// Maximum tenant capacity
export const MAX_TENANT_CAPACITY = 100000;

// Slug validation regex
export const SLUG_REGEX = /^[a-z0-9-]{3,40}$/;

// Email validation regex (RFC compliant)
export const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// Rate limiting
export const RATE_LIMIT = {
  PROVISION_TENANT: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 5, // 5 requests per window
  },
} as const;

// Audit log action types
export const AUDIT_ACTIONS = {
  TENANT_CREATED: 'TENANT_CREATED',
  OWNER_INVITED: 'OWNER_INVITED',
  TENANT_UPDATED: 'TENANT_UPDATED',
  TENANT_DELETED: 'TENANT_DELETED',
  INTEGRATION_CONFIGURED: 'INTEGRATION_CONFIGURED',
} as const;

// Integration providers
export const INTEGRATION_PROVIDERS = {
  EMAIL: {
    RESEND: 'resend',
    SENDGRID: 'sendgrid',
    POSTMARK: 'postmark',
    SMTP: 'smtp',
  },
  PARKING: {
    PARKVIA: 'parkvia',
    HOLIDAYEXTRAS: 'holidayextras',
  },
} as const;
