'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Fetch once on mount, refetch when tab becomes visible (once per visibility change),
 * and expose refetch() for manual Refresh buttons. No interval polling.
 */
export function useVisibilityRefetch<T>(
  fetcher: () => Promise<T>,
  options?: { enabled?: boolean }
): { data: T | null; isLoading: boolean; error: Error | null; refetch: () => Promise<void> } {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const enabled = options?.enabled !== false;

  const refetch = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [fetcher, enabled]);

  useEffect(() => {
    if (!enabled) return;
    refetch();
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps -- run once on mount when enabled

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refetch();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [refetch, enabled]);

  return { data, isLoading, error, refetch };
}
