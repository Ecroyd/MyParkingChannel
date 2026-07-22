import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server-admin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  try {
    // Determine mode from state (e.g., "tenantId:test" or "tenantId:live")
    const requestedMode = state.split(":")[1] || "";
    const forceTest = process.env.STRIPE_MODE === "test";
    const connectMode: "test" | "live" = forceTest
      ? "test"
      : requestedMode === "live"
        ? "live"
        : requestedMode === "test"
          ? "test"
          : process.env.NODE_ENV === "production"
            ? "live"
            : "test";
    const isTest = connectMode === "test";

    // Select the correct Stripe secret key
    const stripeSecret = isTest
      ? (process.env.STRIPE_SECRET_KEY_TEST ?? (process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ? process.env.STRIPE_SECRET_KEY : undefined))
      : (process.env.STRIPE_SECRET_KEY_LIVE ?? (process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? process.env.STRIPE_SECRET_KEY : undefined));

    if (!stripeSecret) {
      throw new Error("Missing Stripe secret key for mode: " + connectMode);
    }

    // Exchange authorization code for access token
    const res = await fetch("https://connect.stripe.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_secret: stripeSecret,
        code,
        grant_type: "authorization_code",
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("Stripe OAuth error:", data);
      return NextResponse.json({ error: data.error_description || "OAuth failed" }, { status: 400 });
    }

    const stripeAccountId = data.stripe_user_id;
    const tenantId = state.split(":")[0] || "unknown";

    // Get account details using the access token
    const accountResponse = await fetch(`https://api.stripe.com/v1/accounts/${stripeAccountId}`, {
      headers: {
        'Authorization': `Bearer ${data.access_token}`,
      },
    });

    if (!accountResponse.ok) {
      console.error('Failed to fetch account details:', await accountResponse.text());
      // Get the current host to build the correct redirect URL
      const host = req.headers.get('host') || 'myparkingchannel.app';
      const protocol = 'https'; // Always use HTTPS for production
      const redirectUrl = `${protocol}://${host}/admin/payments?error=account_details_failed`;
      return NextResponse.redirect(redirectUrl);
    }

    const accountData = await accountResponse.json();

    // Store connection details in database
    const adminClient = await createAdminClient();
    
    // Store basic connection info in tenant_stripe
    const { error: stripeError } = await adminClient
      .from('tenant_stripe')
      .upsert({
        tenant_id: tenantId,
        stripe_account_id: stripeAccountId,
        stripe_publishable_key: accountData.publishable_key,
        stripe_secret_key: data.access_token,
        connected: true,
        mode: connectMode,
      });

    if (stripeError) {
      console.error('Database Error:', stripeError);
      // Get the current host to build the correct redirect URL
      const host = req.headers.get('host') || 'myparkingchannel.app';
      const protocol = 'https'; // Always use HTTPS for production
      const redirectUrl = `${protocol}://${host}/admin/payments?error=database_error`;
      return NextResponse.redirect(redirectUrl);
    }

    // Store webhook secret in tenant_secrets using your existing structure
    const { error: secretError } = await adminClient
      .from('tenant_secrets')
      .upsert({
        tenant_id: tenantId,
        scope: 'stripe',
        key: 'webhook_secret',
        value_ciphertext: '', // Will be set when webhook is configured
        updated_by: null,
      });

    if (secretError) {
      console.error('Secrets Error:', secretError);
      // Don't fail the connection for this, just log it
    }

    // Get the current host to build the correct redirect URL
    const host = req.headers.get('host') || 'myparkingchannel.app';
    const protocol = 'https'; // Always use HTTPS for production
    const redirectUrl = `${protocol}://${host}/admin/payments?success=stripe_connected&tenant=${tenantId}&mode=${connectMode}&connected=true`;
    
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("Stripe callback error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}