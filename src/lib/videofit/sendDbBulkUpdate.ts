// Videofit SendDbBulkUpdate SOAP service
// Sends vehicle records using array-based SOAP structure

import { toVideofitTicks } from './ticks';

export type VideofitConfig = {
  baseUrl: string;
  siteClientLicense: number;
  locPcNo: number;
  defaultGroup: number;
};

export type VideofitRow = {
  plate: string;
  group: number;
  validFrom: Date;
  validUntil: Date;
  action: 'upsert' | 'delete';
};

export type VideofitResult = {
  success: boolean;
  statusCode?: number;
  response?: string;
  error?: string;
  durationMs?: number;
};

/**
 * Build SOAP envelope for SendDbBulkUpdate
 * Uses array-based structure with one element per vehicle
 */
function buildSoapEnvelope(
  siteClientLicense: number,
  locPcNo: number,
  rows: VideofitRow[],
  updateGeneratedAt: string
): string {
  // Build arrays - one element per row
  const deleteVehicle: boolean[] = rows.map((r) => r.action === 'delete');
  const editVehicle: boolean[] = rows.map((r) => r.action === 'upsert');
  const vehPlate: string[] = rows.map((r) => escapeXml(r.plate));
  const vehGroup: number[] = rows.map((r) => r.group);
  const visitArrivalTime: string[] = rows.map((r) => toVideofitTicks(r.validFrom));
  const visitorDepTime: string[] = rows.map((r) => toVideofitTicks(r.validUntil));

  // Build array XML elements - Videofit expects each array element wrapped in its type
  const buildArray = <T>(name: string, items: T[], type: 'boolean' | 'string' | 'int' | 'long') => {
    const itemsXml = items
      .map((item) => {
        if (type === 'boolean') {
          return `<${type}>${item}</${type}>`;
        } else if (type === 'string') {
          return `<${type}>${escapeXml(String(item))}</${type}>`;
        } else {
          return `<${type}>${item}</${type}>`;
        }
      })
      .join('\n      ');
    return `<${name}>\n      ${itemsXml}\n    </${name}>`;
  };

  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <SendDbBulkUpdate xmlns="http://www.videofit.co.uk/Videofit/SendDbBulkUpdateWebService">
      <siteClientLicense>${siteClientLicense}</siteClientLicense>
      <locPcNo>${locPcNo}</locPcNo>
      ${buildArray('deleteVehicle', deleteVehicle, 'boolean')}
      ${buildArray('editVehicle', editVehicle, 'boolean')}
      ${buildArray('vehPlate', vehPlate, 'string')}
      ${buildArray('vehGroup', vehGroup, 'int')}
      ${buildArray('visitArrivalTime', visitArrivalTime, 'long')}
      ${buildArray('visitorDepTime', visitorDepTime, 'long')}
      <updateGeneratedAt>${updateGeneratedAt}</updateGeneratedAt>
    </SendDbBulkUpdate>
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
 * Send vehicle records to Videofit using SendDbBulkUpdate
 */
export async function sendDbBulkUpdate(
  config: VideofitConfig,
  rows: VideofitRow[]
): Promise<VideofitResult> {
  if (rows.length === 0) {
    return { success: false, error: 'No records to send', durationMs: 0 };
  }

  const startTime = Date.now();
  const now = new Date();
  const updateGeneratedAt = toVideofitTicks(now);

  const soapEnvelope = buildSoapEnvelope(
    config.siteClientLicense,
    config.locPcNo,
    rows,
    updateGeneratedAt
  );

  // Build endpoint URL
  const baseUrl = config.baseUrl.replace(/\/$/, '');
  const url = `${baseUrl}/senddbbulkupdatewebservice/senddbbulkupdatewebservice.asmx`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction':
          'http://www.videofit.co.uk/Videofit/SendDbBulkUpdateWebService/SendDbBulkUpdate',
      },
      body: soapEnvelope,
    });

    const durationMs = Date.now() - startTime;
    const responseText = await response.text();

    if (!response.ok) {
      return {
        success: false,
        statusCode: response.status,
        response: responseText,
        error: `HTTP ${response.status}: ${response.statusText}`,
        durationMs,
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
        durationMs,
      };
    }

    return {
      success: true,
      statusCode: response.status,
      response: responseText,
      durationMs,
    };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    return {
      success: false,
      error: error.message || 'Network error',
      durationMs,
    };
  }
}
