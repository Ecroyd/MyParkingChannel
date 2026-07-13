// Client-side Supabase (browser) — compatibility shim
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;
let recoveryWired = false;

function isInvalidRefreshTokenError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message =
    "message" in error ? String((error as { message?: unknown }).message) : "";
  return /Invalid Refresh Token|Refresh Token Not Found|Already Used/i.test(
    message
  );
}

async function clearInvalidSession(supabase: SupabaseClient) {
  try {
    // Local-only: clear cookies/storage without round-tripping a dead refresh token.
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Ignore — storage may already be empty.
  }
}

export function createClient() {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  browserClient = createBrowserClient(url, anonKey);

  if (typeof window !== "undefined" && !recoveryWired) {
    recoveryWired = true;

    // Auto-refresh can leave a dead refresh token after env/project changes.
    // Clear it so the console AuthApiError does not keep replaying.
    void browserClient.auth.getSession().then(({ error }) => {
      if (isInvalidRefreshTokenError(error)) {
        void clearInvalidSession(browserClient!);
      }
    });

    browserClient.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        // no-op: session already cleared
      }
    });
  }

  return browserClient;
}

/** Clear a known-bad refresh token from browser storage. */
export async function recoverInvalidRefreshToken() {
  const supabase = createClient();
  await clearInvalidSession(supabase);
}

export function isRefreshTokenAuthError(error: unknown): boolean {
  return isInvalidRefreshTokenError(error);
}

// Default export for compatibility — lazy singleton via createClient()
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop, receiver) {
    const instance = createClient();
    const value = Reflect.get(instance as object, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

// Optional explicit helper if you prefer this name elsewhere
export const supabaseBrowser = createClient;
