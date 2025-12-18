// Videofit DbBulkUpdate SOAP service
// Sends vehicle records to Videofit ANPR system

import { createAdminClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export type VideofitConfig = {
  api_url: string;
  username?: string;
  password?: string;
};

export type VideofitAction = 'ADD' | 'UPDATE' | 'DELETE';

export type VideofitVehicleRecord = {
  Plate: string; // Uppercase, no spaces
  Group: number; // 4 = Self Park
  ValidFrom: string; // YYYY-MM-DD HH:mm (UTC)
  ValidUntil: string; // YYYY-MM-DD HH:mm (UTC)
};

export type VideofitResult = {
  success: boolean;
  statusCode?: number;
  response?: string;
  error?: string;
};

/**
 * Build SOAP envelope for DbBulkUpdate
 */
function buildSoapEnvelope(action: VideofitAction, records: VideofitVehicleRecord[]): string {
  // Build records XML
  const recordsXml = records
    .map(
      (r) => `
    <Vehicle>
      <Plate>${escapeXml(r.Plate)}</Plate>
      <Group>${r.Group}</Group>
      <ValidFrom>${r.ValidFrom}</ValidFrom>
      <ValidUntil>${r.ValidUntil}</ValidUntil>
    </Vehicle>`
    )
    .join('');

  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <DbBulkUpdate xmlns="http://tempuri.org/">
      <Action>${escapeXml(action)}</Action>
      <Vehicles>
        ${recordsXml}
      </Vehicles>
    </DbBulkUpdate>
  </soap:Body>
</soap:Envelope>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Send vehicle record(s) to Videofit
 */
export async function sendVideofitUpdate(
  config: VideofitConfig,
  action: VideofitAction,
  records: VideofitVehicleRecord[]
): Promise<VideofitResult> {
  if (records.length === 0) {
    return { success: false, error: 'No records to send' };
  }

  const soapEnvelope = buildSoapEnvelope(action, records);
  const url = config.api_url.endsWith('/SendDbBulkUpdateWebService.asmx')
    ? config.api_url
    : `${config.api_url.replace(/\/$/, '')}/SendDbBulkUpdateWebService.asmx`;

  try {
    // Build headers
    const headers: HeadersInit = {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': 'http://tempuri.org/DbBulkUpdate',
    };

    // Add basic auth if credentials provided
    if (config.username && config.password) {
      const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: soapEnvelope,
    });

    const responseText = await response.text();

    if (!response.ok) {
      return {
        success: false,
        statusCode: response.status,
        response: responseText,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    // Parse SOAP response to check for errors
    const hasError = responseText.includes('<faultstring>') || responseText.includes('<soap:Fault>');
    if (hasError) {
      // Try to extract error message
      const faultMatch = responseText.match(/<faultstring[^>]*>([^<]+)<\/faultstring>/i);
      const errorMsg = faultMatch ? faultMatch[1] : 'SOAP fault in response';

      return {
        success: false,
        statusCode: response.status,
        response: responseText,
        error: errorMsg,
      };
    }

    return {
      success: true,
      statusCode: response.status,
      response: responseText,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Network error',
    };
  }
}

/**
 * Get Videofit config for tenant
 */
export async function getVideofitConfig(
  tenantId: string,
  adminClient: SupabaseClient
): Promise<VideofitConfig | null> {
  try {
    const { data: config, error } = await adminClient
      .from('tenant_anpr_config')
      .select('videofit_api_url, videofit_username, videofit_password')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error || !config) {
      return null;
    }

    if (!config.videofit_api_url) {
      return null;
    }

    return {
      api_url: config.videofit_api_url,
      username: config.videofit_username || undefined,
      password: config.videofit_password || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Format date for Videofit (YYYY-MM-DD HH:mm UTC)
 */
export function formatVideofitDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Normalize plate (uppercase, no spaces)
 */
export function normalizePlate(plate: string | null | undefined): string | null {
  if (!plate) return null;
  return plate.replace(/\s+/g, '').trim().toUpperCase() || null;
}
