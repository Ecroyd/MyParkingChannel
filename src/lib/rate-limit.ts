/**
 * Simple in-memory rate limiter
 * For production, consider using Redis or a dedicated rate limiting service
 */

import { RATE_LIMIT } from '@/lib/constants';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory store for rate limiting
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Check if a request should be rate limited
 * @param identifier - Unique identifier for the rate limit (e.g., IP address, user ID)
 * @param limit - Rate limit configuration
 * @returns { allowed: boolean, remaining: number, resetTime: number }
 */
export function checkRateLimit(
  identifier: string,
  limit: { windowMs: number; maxRequests: number }
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);
  
  // If no entry exists or window has expired, create new entry
  if (!entry || now > entry.resetTime) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetTime: now + limit.windowMs,
    };
    rateLimitStore.set(identifier, newEntry);
    
    return {
      allowed: true,
      remaining: limit.maxRequests - 1,
      resetTime: newEntry.resetTime,
    };
  }
  
  // If within window, check if limit exceeded
  if (entry.count >= limit.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
    };
  }
  
  // Increment counter
  entry.count++;
  rateLimitStore.set(identifier, entry);
  
  return {
    allowed: true,
    remaining: limit.maxRequests - entry.count,
    resetTime: entry.resetTime,
  };
}

/**
 * Get client IP address from request
 * @param request - NextRequest object
 * @returns IP address string
 */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (realIP) {
    return realIP;
  }
  
  // Fallback to a default identifier
  return 'unknown';
}

/**
 * Rate limit middleware for API routes
 * @param request - NextRequest object
 * @param limit - Rate limit configuration
 * @returns Rate limit result or null if allowed
 */
export function rateLimitMiddleware(
  request: Request,
  limit: { windowMs: number; maxRequests: number }
): { allowed: boolean; remaining: number; resetTime: number } | null {
  const clientIP = getClientIP(request);
  return checkRateLimit(clientIP, limit);
}

/**
 * Clean up expired entries from the rate limit store
 * This should be called periodically to prevent memory leaks
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Clean up expired entries every 5 minutes
setInterval(cleanupRateLimitStore, 5 * 60 * 1000);
