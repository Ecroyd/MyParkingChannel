// Videofit Ping service for connectivity testing

export type VideofitPingResult = {
  success: boolean;
  statusCode?: number;
  response?: string;
  error?: string;
  durationMs?: number;
};

/**
 * Ping Videofit endpoint to test connectivity
 */
export async function pingVideofit(baseUrl: string): Promise<VideofitPingResult> {
  const startTime = Date.now();
  const url = `${baseUrl.replace(/\/$/, '')}/senddbbulkupdatewebservice/senddbbulkupdatewebservice.asmx`;

  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <Ping xmlns="http://www.videofit.co.uk/Videofit/SendDbBulkUpdateWebService" />
  </soap:Body>
</soap:Envelope>`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://www.videofit.co.uk/Videofit/SendDbBulkUpdateWebService/Ping',
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

    // Check if response contains <PingResult>true</PingResult>
    const pingMatch = responseText.match(/<PingResult[^>]*>([^<]+)<\/PingResult>/i);
    const pingResult = pingMatch ? pingMatch[1].trim().toLowerCase() : '';

    if (pingResult === 'true') {
      return {
        success: true,
        statusCode: response.status,
        response: responseText,
        durationMs,
      };
    } else {
      return {
        success: false,
        statusCode: response.status,
        response: responseText,
        error: `Ping returned: ${pingResult}`,
        durationMs,
      };
    }
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    return {
      success: false,
      error: error.message || 'Network error',
      durationMs,
    };
  }
}
