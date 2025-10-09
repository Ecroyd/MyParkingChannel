import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenant_id") || "unknown";
  const mode = searchParams.get("mode") || "test";

  let clientId = "";
  let redirectUri = "";
  let baseUrl = "https://connect.stripe.com/oauth/v2/authorize";

  // Get the current host to build the correct redirect URI
  const host = req.headers.get('host') || 'myparkingchannel.app';
  const protocol = 'https'; // Always use HTTPS for production
  const baseRedirectUri = `${protocol}://${host}/api/stripe/callback`;

  if (mode === "live") {
    // Live platform client
    clientId = "ca_TBxxxSmeoiiU1clxQQUO0SzIXuYw335v"; // your LIVE client ID
    redirectUri = baseRedirectUri;
  } else {
    // Test platform client (no redirect_uri for test mode)
    clientId = "ca_TBxx6uZatvGwdVLNpsVQaXlY39p3gXTv"; // your TEST client ID
    redirectUri = ""; // No redirect URI for test mode
  }

  // Build the query string
  const query = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: "read_write",
    state: `${tenantId}:${mode}`,
  });

  // Include redirect_uri only for live mode (test mode doesn't need it)
  if (redirectUri) {
    query.append("redirect_uri", redirectUri);
  }

  const stripeUrl = `${baseUrl}?${query.toString()}`;
  return NextResponse.redirect(stripeUrl);
}