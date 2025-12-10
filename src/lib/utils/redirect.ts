// src/lib/utils/redirect.ts

/**
 * Safely redirect to a URL, handling iframe contexts.
 * When embedded in an iframe, redirects the top-level window instead of the iframe.
 * This is required for Stripe Checkout, which cannot run inside an iframe.
 * 
 * @param url - The URL to redirect to
 */
export function redirectToCheckout(url: string): void {
  try {
    if (typeof window === "undefined") {
      return;
    }

    // Check if we're in an iframe
    if (window.top && window.top !== window) {
      // Embedded in an iframe → redirect the top window
      window.top.location.href = url;
    } else {
      // Normal page → just use current window
      window.location.href = url;
    }
  } catch (err) {
    // Fallback if top navigation is blocked (e.g., cross-origin iframe restrictions)
    // Try to redirect the current window as a last resort
    console.warn("Could not redirect top-level window, falling back to current window:", err);
    try {
      window.location.href = url;
    } catch (fallbackErr) {
      console.error("Failed to redirect:", fallbackErr);
    }
  }
}

