import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createTelemetryFetch } from "@/lib/supabase/queryTelemetry";

/** True when the request likely carries a Supabase auth session cookie. */
export function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some(
    (c) =>
      c.name.includes('-auth-token') ||
      c.name.startsWith('sb-') ||
      c.name.includes('supabase')
  );
}

/**
 * Refresh the Supabase auth session and write updated cookies onto the response.
 * Must run in middleware so Server Components can read a valid access token after
 * the PWA has been backgrounded (JWT expiry / refresh rotation).
 *
 * Cookie-less requests skip Auth entirely — public traffic was paying getUser()
 * RTT + Active CPU on every HTML hit.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  if (!hasSupabaseAuthCookie(request)) {
    return supabaseResponse;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anonKey, {
    global: { fetch: createTelemetryFetch("middleware-auth") },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  // Touches the session and triggers refresh-token rotation when needed.
  // Do not place logic between createServerClient and getUser().
  await supabase.auth.getUser();

  return supabaseResponse;
}

/** Copy Set-Cookie values from a session response onto another response. */
export function copyAuthCookies(from: NextResponse, to: NextResponse): NextResponse {
  const setCookies =
    typeof from.headers.getSetCookie === "function" ? from.headers.getSetCookie() : [];
  if (setCookies.length > 0) {
    for (const cookie of setCookies) {
      to.headers.append("set-cookie", cookie);
    }
    return to;
  }
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value);
  });
  return to;
}
