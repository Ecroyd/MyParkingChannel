/**
 * File type utilities for email ingest
 */

/**
 * Check if a file is an image type (should be skipped)
 */
export function isImageFile(filename: string, contentType?: string | null): boolean {
  // Check by extension
  const ext = filename.toLowerCase().split('.').pop() || '';
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico'];
  if (imageExtensions.includes(`.${ext}`)) {
    return true;
  }

  // Check by content-type
  if (contentType && contentType.toLowerCase().startsWith('image/')) {
    return true;
  }

  return false;
}

/**
 * Check if a file is booking-capable (can contain booking data)
 */
export function isBookingCapableFile(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop() || '';
  const bookingExtensions = ['.csv', '.txt', '.eml', '.pdf'];
  return bookingExtensions.includes(`.${ext}`);
}
