// Client-side Supabase (browser) — compatibility shim
import { createBrowserClient } from "@supabase/ssr";
import { telemetryClientOptions } from "./queryTelemetry";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    telemetryClientOptions("browser")
  );
}

// Default export for compatibility
export const supabase = createClient();

// Optional explicit helper if you prefer this name elsewhere
export const supabaseBrowser = createClient;