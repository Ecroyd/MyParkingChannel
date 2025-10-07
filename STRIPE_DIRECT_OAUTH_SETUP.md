# Stripe Direct OAuth Setup Guide

## ✅ **Implementation Complete**

I've updated your Stripe Connect implementation to use the **direct OAuth URL approach** as you requested. This is simpler and more reliable than using the Stripe SDK.

## 🔧 **Environment Variables Required**

Add these to your `.env.local` file:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_xxx               # Your platform secret key
STRIPE_CLIENT_ID=ca_xxx                     # Your Stripe Connect client ID
NEXT_PUBLIC_SITE_URL=http://localhost:3002  # For local development

# Your existing Supabase variables (keep these)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## 🎯 **How It Works Now**

### **1. Connect Flow**
When tenant clicks "Connect Stripe Account":
- Redirects to: `/api/stripe/connect?tenant_id={tenantId}`
- Builds OAuth URL: `https://connect.stripe.com/oauth/v2/authorize?client_id=ca_xxx&response_type=code&scope=read_write&redirect_uri=http://localhost:3002/api/stripe/callback&state={tenantId}`
- Redirects to Stripe's hosted authorization page

### **2. Callback Flow**
After tenant authorizes:
- Stripe redirects to: `/api/stripe/callback?code=ac_12345&state={tenantId}`
- Exchanges code for access token using direct API call
- Stores connection details in database
- Redirects back to: `/admin/payments?success=stripe_connected`

## 🔑 **Get Your Stripe Keys**

### **1. Secret Key**
- Go to [Stripe Dashboard](https://dashboard.stripe.com) → Developers → API Keys
- Copy your **Secret key** (starts with `sk_test_`)

### **2. Client ID**
- Go to [Stripe Dashboard](https://dashboard.stripe.com) → Connect → Settings
- Copy your **Client ID** (starts with `ca_`)

## 🚀 **Test the Implementation**

1. **Set environment variables** in `.env.local`
2. **Restart your development server**: `npm run dev`
3. **Go to**: `/admin/payments`
4. **Click**: "Connect Stripe Account"
5. **Complete Stripe onboarding**
6. **Verify**: Connection stored in database

## 📋 **Database Migration**

Make sure you've run the database migration to create the `tenant_stripe` table:

```sql
-- Run this in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS public.tenant_stripe (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  stripe_account_id text,
  stripe_publishable_key text,
  stripe_secret_key text,
  stripe_webhook_secret text,
  connected boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tenant_stripe ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY "tenant_stripe_owner" 
ON public.tenant_stripe
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_tenants ut 
    WHERE ut.user_id = auth.uid()
    AND ut.tenant_id = tenant_stripe.tenant_id
  )
);
```

## 🎉 **Benefits of Direct OAuth**

- ✅ **Simpler**: No Stripe SDK dependencies
- ✅ **More reliable**: Direct API calls
- ✅ **Better error handling**: Full control over the flow
- ✅ **Easier debugging**: Clear request/response flow

## 🔍 **Debug Endpoint**

Check your configuration: `http://localhost:3002/api/debug/stripe-config`

This will show you which environment variables are set.

Your Stripe Connect implementation is now ready! 🚀
