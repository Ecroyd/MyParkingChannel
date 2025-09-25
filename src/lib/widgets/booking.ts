/**
 * Booking widget utilities
 * Handles widget generation and configuration
 */

import { clientEnv } from '@/lib/env';

/**
 * Generate widget URL for a tenant
 * @param tenantSlug - The tenant's slug
 * @param customDomain - Optional custom domain
 * @returns Widget URL
 */
export function generateWidgetUrl(tenantSlug: string, customDomain?: string): string {
  const baseUrl = customDomain || clientEnv.NEXT_PUBLIC_SITE_URL;
  return `${baseUrl}/widget/${tenantSlug}.js`;
}

/**
 * Generate tenant site URL
 * @param tenantSlug - The tenant's slug
 * @param customDomain - Optional custom domain
 * @returns Tenant site URL
 */
export function generateTenantSiteUrl(tenantSlug: string, customDomain?: string): string {
  const baseUrl = customDomain || clientEnv.NEXT_PUBLIC_SITE_URL;
  return `${baseUrl}/sites/${tenantSlug}`;
}

/**
 * Generate HTML embed snippet for a tenant
 * @param tenantSlug - The tenant's slug
 * @param customDomain - Optional custom domain
 * @returns HTML embed snippet
 */
export function generateEmbedSnippet(tenantSlug: string, customDomain?: string): string {
  const widgetUrl = generateWidgetUrl(tenantSlug, customDomain);
  return `<script src="${widgetUrl}"></script>`;
}

/**
 * Generate iframe embed snippet (alternative to script)
 * @param tenantSlug - The tenant's slug
 * @param customDomain - Optional custom domain
 * @param options - Iframe options
 * @returns HTML iframe snippet
 */
export function generateIframeSnippet(
  tenantSlug: string, 
  customDomain?: string,
  options: {
    width?: string;
    height?: string;
    frameborder?: string;
    allowfullscreen?: boolean;
  } = {}
): string {
  const tenantUrl = generateTenantSiteUrl(tenantSlug, customDomain);
  const {
    width = '100%',
    height = '600px',
    frameborder = '0',
    allowfullscreen = true
  } = options;
  
  return `<iframe 
  src="${tenantUrl}" 
  width="${width}" 
  height="${height}" 
  frameborder="${frameborder}"
  ${allowfullscreen ? 'allowfullscreen' : ''}
  style="border: none; border-radius: 8px;">
</iframe>`;
}

/**
 * Validate tenant slug for widget usage
 * @param tenantSlug - The tenant's slug
 * @returns Validation result
 */
export function validateTenantSlug(tenantSlug: string): { valid: boolean; error?: string } {
  if (!tenantSlug) {
    return { valid: false, error: 'Tenant slug is required' };
  }
  
  if (tenantSlug.length < 3) {
    return { valid: false, error: 'Tenant slug must be at least 3 characters' };
  }
  
  if (tenantSlug.length > 40) {
    return { valid: false, error: 'Tenant slug must be less than 40 characters' };
  }
  
  if (!/^[a-z0-9-]+$/.test(tenantSlug)) {
    return { valid: false, error: 'Tenant slug must contain only lowercase letters, numbers, and hyphens' };
  }
  
  return { valid: true };
}

/**
 * Get widget configuration for a tenant
 * @param tenantSlug - The tenant's slug
 * @returns Widget configuration
 */
export function getWidgetConfig(tenantSlug: string) {
  const validation = validateTenantSlug(tenantSlug);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  
  return {
    tenantSlug,
    widgetUrl: generateWidgetUrl(tenantSlug),
    tenantSiteUrl: generateTenantSiteUrl(tenantSlug),
    embedSnippet: generateEmbedSnippet(tenantSlug),
    iframeSnippet: generateIframeSnippet(tenantSlug),
  };
}
