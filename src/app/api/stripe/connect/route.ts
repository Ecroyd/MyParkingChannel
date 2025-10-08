import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenant_id") || "unknown";
  const mode = searchParams.get("mode") || "test";

  let clientId = "";
  let redirectUri = "";
  let baseUrl = "https://connect.stripe.com/oauth/v2/authorize";

  if (mode === "live") {
    // Live platform client
    clientId = "ca_TBxxxSmeoiiU1clxQQUO0SzIXuYw335v"; // your LIVE client ID
    redirectUri = "https://myparkingchannel.app/api/stripe/callback";
  } else {
    // Test platform client (no redirect_uri parameter)
    clientId = "ca_TBxx6uZatvGwdVLNpsVQaXlY39p3gXTv"; // your TEST client ID
  }

  // Build the query string
  const query = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: "read_write",
    state: `${tenantId}:${mode}`,
  });

  // Only include redirect_uri for live mode
  if (redirectUri) {
    query.append("redirect_uri", redirectUri);
  }

  const stripeUrl = `${baseUrl}?${query.toString()}`;
  return NextResponse.redirect(stripeUrl);
}