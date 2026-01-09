// Videofit utility functions for parsing and converting data

/**
 * Convert .NET ticks (Int64) to JavaScript Date
 * .NET ticks are 100-nanosecond intervals since 0001-01-01 00:00:00 UTC
 * JavaScript Date uses milliseconds since 1970-01-01 00:00:00 UTC
 * 
 * .NET epoch: 0001-01-01 00:00:00 UTC
 * JS epoch: 1970-01-01 00:00:00 UTC
 * Difference: 621355968000000000 ticks (or 62135596800000 milliseconds)
 */
export function ticksToDate(ticks: number | string): Date {
  const ticksNum = typeof ticks === 'string' ? parseInt(ticks, 10) : ticks;
  
  if (isNaN(ticksNum)) {
    throw new Error(`Invalid ticks value: ${ticks}`);
  }

  // .NET ticks are in 100-nanosecond intervals
  // Convert to milliseconds: divide by 10,000
  const ticksInMs = ticksNum / 10000;
  
  // .NET epoch is 62135596800000 milliseconds before JS epoch
  const dotNetEpochOffsetMs = 62135596800000;
  
  // Convert to JS Date
  const jsDate = new Date(ticksInMs - dotNetEpochOffsetMs);
  
  return jsDate;
}

/**
 * Parse SOAP XML body and extract SendCapture fields
 * Expected SOAP structure:
 * <soap:Envelope>
 *   <soap:Body>
 *     <sendCapture>
 *       <siteClientLicense>...</siteClientLicense>
 *       <time>...</time>
 *       <locSite>...</locSite>
 *       <locPc>...</locPc>
 *       <locPcNo>...</locPcNo>
 *       <locCameraNo>...</locCameraNo>
 *       <locCamera>...</locCamera>
 *       <vehPlate>...</vehPlate>
 *       <vehGroup>...</vehGroup>
 *     </sendCapture>
 *   </soap:Body>
 * </soap:Envelope>
 */
export function parseSoapSendCapture(xmlBody: string): {
  siteClientLicense: number | null;
  time: number; // ticks
  locSite: string | null;
  locPc: string | null;
  locPcNo: number | null;
  locCameraNo: number | null;
  locCamera: string | null;
  vehPlate: string;
  vehGroup: number | null;
} {
  // Simple XML parsing using regex (for basic SOAP structure)
  // For production, consider using a proper XML parser like xml2js or fast-xml-parser
  
  const extractTag = (tagName: string): string | null => {
    // Match tag with or without namespace prefix
    const regex = new RegExp(`<[^:]*:?${tagName}[^>]*>([^<]*)</[^:]*:?${tagName}>`, 'i');
    const match = xmlBody.match(regex);
    return match ? match[1].trim() : null;
  };

  const siteClientLicenseStr = extractTag('siteClientLicense');
  const timeStr = extractTag('time');
  const locSite = extractTag('locSite');
  const locPc = extractTag('locPc');
  const locPcNoStr = extractTag('locPcNo');
  const locCameraNoStr = extractTag('locCameraNo');
  const locCamera = extractTag('locCamera');
  const vehPlate = extractTag('vehPlate');
  const vehGroupStr = extractTag('vehGroup');

  if (!timeStr || !vehPlate) {
    throw new Error('Missing required fields: time and vehPlate are required');
  }

  return {
    siteClientLicense: siteClientLicenseStr ? parseInt(siteClientLicenseStr, 10) : null,
    time: parseInt(timeStr, 10),
    locSite: locSite || null,
    locPc: locPc || null,
    locPcNo: locPcNoStr ? parseInt(locPcNoStr, 10) : null,
    locCameraNo: locCameraNoStr ? parseInt(locCameraNoStr, 10) : null,
    locCamera: locCamera || null,
    vehPlate: vehPlate.trim(),
    vehGroup: vehGroupStr ? parseInt(vehGroupStr, 10) : null,
  };
}

/**
 * Determine camera direction from camera mapping
 * camera_direction_map keys can be:
 * - "cameraNo:1" (UI camera number, where UI number = internal + 1)
 * - "cameraNoInternal:0" (internal camera number)
 * 
 * locCameraNo is internal (0-15), so UI number = locCameraNo + 1
 */
export function getCameraDirection(
  locCameraNo: number | null,
  cameraDirectionMap: Record<string, string>
): 'in' | 'out' | 'unknown' {
  if (locCameraNo === null || locCameraNo === undefined) {
    return 'unknown';
  }

  // Try UI camera number first (cameraNo:1)
  const uiCameraNo = locCameraNo + 1;
  const uiKey = `cameraNo:${uiCameraNo}`;
  if (cameraDirectionMap[uiKey]) {
    const direction = cameraDirectionMap[uiKey].toLowerCase();
    if (direction === 'in' || direction === 'entry') return 'in';
    if (direction === 'out' || direction === 'exit') return 'out';
  }

  // Try internal camera number (cameraNoInternal:0)
  const internalKey = `cameraNoInternal:${locCameraNo}`;
  if (cameraDirectionMap[internalKey]) {
    const direction = cameraDirectionMap[internalKey].toLowerCase();
    if (direction === 'in' || direction === 'entry') return 'in';
    if (direction === 'out' || direction === 'exit') return 'out';
  }

  return 'unknown';
}

/**
 * Generate cameraId string for storage
 * Format: ${locPcNo}-${locCameraNo} or ${locPc}-${locCamera} if available
 */
export function generateCameraId(
  locPcNo: number | null,
  locCameraNo: number | null,
  locPc: string | null,
  locCamera: string | null
): string | null {
  if (locPcNo !== null && locCameraNo !== null) {
    return `${locPcNo}-${locCameraNo}`;
  }
  if (locPc && locCamera) {
    return `${locPc}-${locCamera}`;
  }
  if (locCamera) {
    return locCamera;
  }
  return null;
}
