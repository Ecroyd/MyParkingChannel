import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenant_id") || "unknown";
  const mode = searchParams.get("mode") || "test";

  const host = req.headers.get("host") || "myparkingchannel.app";
  const protocol = "https";
  const baseRedirectUri = `${protocol}://${host}/api/stripe/callback`;

  const isLive = mode === "live";
  const clientId = isLive
    ? process.env.STRIPE_CLIENT_ID_LIVE
    : process.env.STRIPE_CLIENT_ID_TEST;

  if (!clientId) {
    return NextResponse.json(
      {
        error: `Missing STRIPE_CLIENT_ID_${isLive ? "LIVE" : "TEST"} environment variable`,
      },
      { status: 500 }
    );
  }

  // Live Connect OAuth requires an explicit redirect_uri registered in Stripe Dashboard
  const redirectUri = isLive ? baseRedirectUri : "";

  const query = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: "read_write",
    state: `${tenantId}:${mode}`,
  });

  if (redirectUri) {
    query.append("redirect_uri", redirectUri);
  }

  const stripeUrl = `https://connect.stripe.com/oauth/v2/authorize?${query.toString()}`;
  return NextResponse.redirect(stripeUrl);
}
