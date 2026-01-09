// Camera direction mapping utilities
// Maps camera IDs to directions (in/out/ignore)

/**
 * Get direction from camera mapping using cameraId
 * camera_direction_map keys are camera IDs (e.g., "1-1", "998-0", "Camera-1")
 * Values can be: "in", "out", "entry", "exit", "ignore"
 */
export function getDirectionFromCameraId(
  cameraId: string | null | undefined,
  cameraDirectionMap: Record<string, string>
): 'in' | 'out' | 'unknown' {
  if (!cameraId) {
    return 'unknown';
  }

  const mapping = cameraDirectionMap[cameraId];
  if (!mapping) {
    return 'unknown';
  }

  const direction = mapping.toLowerCase().trim();
  
  // Normalize to 'in' or 'out'
  if (direction === 'in' || direction === 'entry') {
    return 'in';
  }
  if (direction === 'out' || direction === 'exit') {
    return 'out';
  }
  if (direction === 'ignore') {
    return 'unknown'; // Treat ignore as unknown
  }

  return 'unknown';
}

/**
 * Get direction from camera mapping for Videofit SOAP ingest
 * Supports both cameraId and locCameraNo (for backward compatibility)
 */
export function getDirectionForVideofit(
  cameraId: string | null | undefined,
  locCameraNo: number | null | undefined,
  cameraDirectionMap: Record<string, string>
): 'in' | 'out' | 'unknown' {
  // First try cameraId (preferred)
  if (cameraId) {
    const direction = getDirectionFromCameraId(cameraId, cameraDirectionMap);
    if (direction !== 'unknown') {
      return direction;
    }
  }

  // Fallback: try locCameraNo-based keys (for backward compatibility)
  if (locCameraNo !== null && locCameraNo !== undefined) {
    // Try UI camera number (cameraNo:1)
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
  }

  return 'unknown';
}
