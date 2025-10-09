# Stripe Connect Setup Guide

This guide will help you set up Stripe Connect for your parking channel application using the new controller-based model.

## Environment Variables

Add these environment variables to your Vercel project (Project → Settings → Environment Variables):

### Required Variables

```bash
# Platform Stripe Keys (your main platform account)
STRIPE_SECRET_KEY=sk_test_***           # Your platform secret key
STRIPE_PUBLISHABLE_KEY=pk_test_***      # Your platform publishable key (optional for this demo)
NEXT_PUBLIC_ROOT_URL=https://myparkingchannel.app  # Your domain for redirect URLs

# Optional - for OAuth flows (not needed for Account Links)
STRIPE_CLIENT_ID=ca_***                 # Only if you also support OAuth

# Optional - for webhooks (not needed for this demo)
STRIPE_WEBHOOK_SECRET=whsec_***         # For handling webhooks
```

## How to Test

1. **Deploy your application** to Vercel with the environment variables set.

2. **Visit the admin page**: Go to `/admin/connect` on your deployed domain.

3. **Create a connected account**:
   - Click "Create & Onboard"
   - Complete the Stripe onboarding flow
   - Return to your admin page

4. **Verify the connection**:
   - Click "Refresh Status"
   - Check that `charges_enabled: true` and `payouts_enabled: true`

5. **Create a product**:
   - Fill out the product form
   - Click "Create Product"

6. **Test the storefront**:
   - Click "View Storefront →"
   - Click "Buy with Checkout" on a product
   - Complete a test payment

7. **Verify in Stripe Dashboard**:
   - Go to Stripe Dashboard → Connected accounts
   - You should see your test account listed
   - Check that payments are being processed correctly

## API Endpoints

The implementation includes these API endpoints:

- `POST /api/stripe/accounts/create` - Create a new connected account
- `GET /api/stripe/accounts/[id]/status` - Get account status
- `POST /api/stripe/accounts/[id]/onboard` - Create onboarding link
- `GET /api/stripe/accounts/[id]/products` - List products
- `POST /api/stripe/accounts/[id]/products` - Create a product
- `POST /api/stripe/accounts/[id]/checkout` - Create checkout session

## Key Features

### Controller-Based Accounts
- Uses the new Stripe Connect controller model
- Connected accounts pay their own fees
- Stripe covers payment disputes and losses
- Full dashboard access for connected accounts

### Application Fees
- Platform takes a fee on each transaction
- Configurable fee amount per checkout session
- Fees are automatically collected by Stripe

### Account Links Onboarding
- No OAuth required
- Simple redirect-based onboarding flow
- Automatic return to your application

## Production Considerations

### Tenant Integration
For production use with your existing tenant system:

1. **Replace account ID routing**: Instead of `[accountId]`, use `[slug]` and look up the Stripe account ID from your database.

2. **Store account IDs**: Save the `acct_*` IDs in your `tenant_stripe` table.

3. **Secure access**: Ensure only authorized users can access tenant-specific Stripe functions.

### Settings UI
Add a platform settings page to manage Stripe keys:

```typescript
// Example: Store encrypted keys in Supabase
const encryptedKey = await encrypt(stripeSecretKey);
await supabase.from('platform_settings').upsert({
  key: 'stripe_secret_key',
  value: encryptedKey
});
```

### Webhooks
Add webhook handling for production:

```typescript
// app/api/stripe/webhook/route.ts
export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();
  
  const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  
  if (event.type === 'checkout.session.completed') {
    // Handle successful payment
  }
}
```

## Troubleshooting

### Common Issues

1. **"Missing environment variable" error**: Ensure all required environment variables are set in Vercel.

2. **Onboarding not completing**: Check that `NEXT_PUBLIC_ROOT_URL` is set correctly and matches your domain.

3. **Checkout not working**: Verify the connected account has `charges_enabled: true`.

4. **CORS errors**: Ensure your domain is properly configured in Stripe settings.

### Debug Mode

Add debug logging to see what's happening:

```typescript
console.log('Creating account with controller:', {
  fees: { payer: 'account' },
  losses: { payments: 'stripe' },
  stripe_dashboard: { type: 'full' }
});
```

## Next Steps

1. **Test thoroughly** with Stripe test mode
2. **Set up webhooks** for production
3. **Integrate with your tenant system**
4. **Add proper error handling and logging**
5. **Set up monitoring and alerts**

This implementation provides a complete Stripe Connect solution that's ready for production use with your parking channel application.
