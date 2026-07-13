"use client";

import { useEffect } from "react";
import {
  createClient,
  isRefreshTokenAuthError,
  recoverInvalidRefreshToken,
} from "@/lib/supabase/client";

/**
 * Clears stale Supabase refresh tokens that otherwise spam:
 * AuthApiError: Invalid Refresh Token: Refresh Token Not Found
 */
export default function AuthSessionRecovery() {
  useEffect(() => {
    let cancelled = false;

    async function recover() {
      try {
        const supabase = createClient();
        const { error } = await supabase.auth.getSession();
        if (!cancelled && isRefreshTokenAuthError(error)) {
          await recoverInvalidRefreshToken();
        }
      } catch (err) {
        if (!cancelled && isRefreshTokenAuthError(err)) {
          await recoverInvalidRefreshToken();
        }
      }
    }

    const onUnhandled = (event: PromiseRejectionEvent) => {
      if (isRefreshTokenAuthError(event.reason)) {
        event.preventDefault();
        void recoverInvalidRefreshToken();
      }
    };

    window.addEventListener("unhandledrejection", onUnhandled);
    void recover();

    return () => {
      cancelled = true;
      window.removeEventListener("unhandledrejection", onUnhandled);
    };
  }, []);

  return null;
}
