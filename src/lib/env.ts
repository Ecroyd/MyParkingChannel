/**
 * Environment variable validation and type safety
 * Server-only variables are protected from client access
 */

// Client-safe environment variables
export const clientEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL!,
  NEXT_PUBLIC_ENABLE_SELF_SIGNUP: process.env.NEXT_PUBLIC_ENABLE_SELF_SIGNUP === 'true',
} as const;

// Server-only environment variables (protected from client access)
export const serverEnv = {
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
} as const;

// Validation function to ensure required env vars are present
export function validateEnv() {
  const requiredClientVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SITE_URL',
  ] as const;

  const requiredServerVars = [
    'SUPABASE_SERVICE_ROLE_KEY',
  ] as const;

  // Check client vars
  for (const varName of requiredClientVars) {
    if (!process.env[varName]) {
      throw new Error(`Missing required environment variable: ${varName}`);
    }
  }

  // Check server vars (only when running on server)
  if (typeof window === 'undefined') {
    for (const varName of requiredServerVars) {
      if (!process.env[varName]) {
        throw new Error(`Missing required server environment variable: ${varName}. This is required for admin operations like tenant provisioning.`);
      }
    }
  }
}

// Type guard to prevent server-only env access on client
export function isServerOnly() {
  return typeof window === 'undefined';
}

// Server-only env access with runtime protection
export function getServerEnv() {
  if (!isServerOnly()) {
    throw new Error('Server-only environment variables cannot be accessed on the client');
  }
  return serverEnv;
}