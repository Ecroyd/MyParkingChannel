"use client";

import { Button } from "@/components/ui/button";

export default function TestStripeConnectPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-8">
      <h1 className="text-2xl font-semibold">Stripe Connect – Test Mode</h1>
      <p className="text-gray-500 text-center max-w-md">
        This page uses Stripe's test environment. You can connect a test account and simulate
        payments safely — no real money moves.
      </p>

      <Button asChild>
        <a
          href="https://connect.stripe.com/oauth/v2/authorize?client_id=ca_TBxx6uZatvGwdVLNpsVQaXlY39p3gXTv&response_type=code&scope=read_write&redirect_uri=https://myparkingchannel.app/api/stripe/callback&state=test-tenant"
          className="px-6 py-3 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          Connect Stripe Account (Test Mode)
        </a>
      </Button>

      <p className="text-xs text-gray-400">
        Using hard-wired test Client ID <code>ca_TBxx6uZatvGwdVLNpsVQaXlY39p3gXTv</code>
      </p>
    </div>
  );
}
