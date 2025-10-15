# Fix Stripe Test Mode Issue

## Problem
The application is trying to use a live Stripe key (`sk_live_...`) but you want to use test keys.

## Solution

### 1. Set Environment Variables

Create or update your `.env.local` file with these variables:

```bash
# Force test mode even in production
STRIPE_MODE=test

# Your test keys
STRIPE_SECRET_KEY_TEST=sk_test_your_test_key_here
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST=pk_test_your_test_publishable_key_here

# Optional: Set test client ID
STRIPE_CLIENT_ID_TEST=ca_test_your_test_client_id_here
```

### 2. For Production Deployment

If you're deploying to production but want to use test keys, set these environment variables in your deployment platform:

- `STRIPE_MODE=test`
- `STRIPE_SECRET_KEY_TEST=sk_test_...`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST=pk_test_...`

### 3. Verify the Fix

The application will now:
1. Check `STRIPE_MODE=test` first
2. Use `STRIPE_SECRET_KEY_TEST` instead of `STRIPE_SECRET_KEY`
3. Log which key is being used in the console

### 4. Debug Information

The application will log:
- `🔍 [STRIPE] Using test key in production (testing mode)`
- `🔍 [TENANT STRIPE] Key selection for tenant: ...`

This confirms it's using the test key instead of the live key.

## Why This Happened

The issue was that the tenant Stripe configuration was checking the database first (`tenant_stripe` and `tenant_secrets` tables) before falling back to environment variables. If there were live keys stored in the database for your tenant, it would use those instead of respecting the `STRIPE_MODE=test` setting.

The fix ensures that when `STRIPE_MODE=test` is set, it skips the database lookup entirely and uses the environment variables (`STRIPE_SECRET_KEY_TEST`) instead.
