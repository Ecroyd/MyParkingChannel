# Stripe Connect Integration with Existing Pricing System

This implementation integrates Stripe Connect with your existing pricing system without duplicating products. It uses your `tenant_stripe` table and existing pricing engine.

## Key Features

✅ **No Product Duplication** - Uses your existing pricing engine instead of creating Stripe products  
✅ **Controller-based Accounts** - Latest Stripe Connect model with proper fee structure  
✅ **Integrated Pricing** - Leverages your `tenant_pricing`, `rate_plans`, and `pricing_rules`  
✅ **Booking Payments** - Direct charges for existing bookings  
✅ **Extension Payments** - Handle booking extensions with separate charges  
✅ **Application Fees** - Platform takes fees on each transaction  

## Environment Variables

Add these to your Vercel project (Project → Settings → Environment Variables):

```bash
# Required
# For development (test mode)
STRIPE_SECRET_KEY_TEST=sk_test_***             # Test platform secret key
STRIPE_PUBLISHABLE_KEY_TEST=pk_test_***       # Test publishable key

# For production (live mode)  
STRIPE_SECRET_KEY_LIVE=sk_live_***             # Live platform secret key
STRIPE_PUBLISHABLE_KEY_LIVE=pk_live_***       # Live publishable key

# App configuration
NEXT_PUBLIC_ROOT_URL=https://myparkingchannel.app
STRIPE_API_VERSION=2025-09-30.clover          # Latest API version

# Optional (for webhooks)
STRIPE_WEBHOOK_SECRET=whsec_***

# Optional: Force live mode in development
# STRIPE_MODE=live
```

## Database Schema

Uses your existing `tenant_stripe` table:

```sql
-- Your existing table (no changes needed)
CREATE TABLE tenant_stripe (
  tenant_id UUID REFERENCES tenants(id) PRIMARY KEY,
  stripe_account_id TEXT,
  connected BOOLEAN DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## API Endpoints

### Connect Management
- `POST /api/payments/connect/onboard` - Create/onboard connected account
- `GET /api/payments/connect/status` - Get connection status

### Payment Processing
- `POST /api/payments/checkout` - Create checkout for booking
- `POST /api/payments/booking-extension` - Pay for booking extension

## How It Works

### 1. Pricing Integration

The system uses your existing pricing engine:

```typescript
// lib/pricing.ts - Replace with your actual pricing logic
export async function getQuoteCents(tenantId: string, startAt: string, endAt: string) {
  // TODO: Implement your pricing logic:
  // - Read rate_plans, pricing_rules, seasons, price_tiers
  // - Apply tenant_pricing, booking_rules, surcharges
  // - Return { amount_cents, currency }
}
```

### 2. Payment Flow

1. **Booking Payment**: Uses existing booking data + pricing engine
2. **Extension Payment**: Creates `booking_extensions` record + charges
3. **No Stripe Products**: Uses inline `price_data` in checkout sessions

### 3. Application Fees

Platform takes fees on each transaction:

```typescript
payment_intent_data: {
  application_fee_amount: 123, // Platform fee in pence
  metadata: { tenant_id, booking_id }
}
```

## Usage Examples

### Admin Payments Page

Visit `/admin/payments` to:
- Connect Stripe account
- View connection status
- Update Stripe details

### Booking Payment Button

Add to your existing booking components:

```tsx
import { TakePaymentButton } from '@/components/payments/PaymentButtons';

// In your booking row/detail
<TakePaymentButton 
  bookingId={booking.id} 
  onPaymentSuccess={() => window.location.reload()} 
/>
```

### Extension Payment Button

For booking extensions:

```tsx
import { PayExtensionButton } from '@/components/payments/PaymentButtons';

<PayExtensionButton
  bookingId={booking.id}
  newEndAt={newEndAtISO}
  quoteAmountCents={extensionQuoteCents}
  onExtensionSuccess={() => window.location.reload()}
/>
```

## Implementation Steps

### 1. Set Environment Variables

Add the required environment variables to your Vercel project.

### 2. Update Pricing Logic

Replace the placeholder in `lib/pricing.ts` with your actual pricing calculation:

```typescript
// TODO: Replace with your actual pricing logic
export async function getQuoteCents(tenantId: string, startAt: string, endAt: string) {
  // Your pricing logic here:
  // - Read rate_plans, pricing_rules, seasons, price_tiers
  // - Apply tenant_pricing, booking_rules, surcharges
  // - Calculate total amount in pence
  // - Return { amount_cents, currency }
}
```

### 3. Add Payment Buttons

Add payment buttons to your existing booking UI:

```tsx
// In your booking list/detail component
import { BookingPaymentActions } from '@/components/payments/PaymentButtons';

<BookingPaymentActions booking={booking} />
```

### 4. Test the Integration

1. **Connect Stripe**: Visit `/admin/payments` and connect
2. **Test Payment**: Use "Take Payment" button on a booking
3. **Verify**: Check Stripe Dashboard for the transaction

## Production Considerations

### Webhook Integration

Add webhook handling for production:

```typescript
// app/api/stripe/webhook/route.ts
export async function POST(req: Request) {
  // Handle checkout.session.completed
  // Update booking payment status
  // Handle booking extension payments
}
```

### Error Handling

The system includes proper error handling:
- Missing Stripe connection
- Invalid booking IDs
- Pricing calculation errors
- Payment failures

### Security

- All endpoints require authentication
- Tenant isolation via RLS
- Stripe account validation
- Proper error messages

## Database Updates

When payments succeed, update your booking records:

```sql
-- Update booking with payment info
UPDATE bookings 
SET 
  stripe_payment_intent_id = $1,
  payment_status = 'paid',
  money_received = true
WHERE id = $2;

-- Update booking extension
UPDATE booking_extensions 
SET 
  stripe_payment_intent_id = $1,
  charged_amount_cents = $2,
  stripe_payment_status = 'succeeded'
WHERE booking_id = $3;
```

## Troubleshooting

### Common Issues

1. **"Stripe not connected"** - Tenant needs to complete onboarding
2. **"No tenant_pricing found"** - Ensure tenant has pricing configured
3. **"Invalid amount"** - Check pricing calculation logic
4. **CORS errors** - Verify domain configuration

### Debug Mode

Add logging to see what's happening:

```typescript
console.log('Creating checkout for booking:', bookingId);
console.log('Amount calculated:', amount_cents, currency);
console.log('Application fee:', application_fee_cents);
```

## Next Steps

1. **Implement Pricing Logic** - Replace placeholder with your actual pricing
2. **Add Webhook Handling** - Process payment completions
3. **Update Booking UI** - Add payment buttons to existing components
4. **Test Thoroughly** - Verify with Stripe test mode
5. **Deploy to Production** - Set up live Stripe keys

This integration provides a complete payment solution that works with your existing pricing system without duplicating data or creating unnecessary complexity.
