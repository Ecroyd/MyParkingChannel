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
    // Test platform client
    clientId = "ca_TBxx6uZatvGwdVLNpsVQaXlY39p3gXTv"; // your TEST client ID
    redirectUri = "https://myparkingchannel.app/api/stripe/callback";
  }

  // Build the query string
  const query = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: "read_write",
    state: `${tenantId}:${mode}`,
  });

  // Include redirect_uri for both test and live modes
  if (redirectUri) {
    query.append("redirect_uri", redirectUri);
  }

  const stripeUrl = `${baseUrl}?${query.toString()}`;
  return NextResponse.redirect(stripeUrl);
}