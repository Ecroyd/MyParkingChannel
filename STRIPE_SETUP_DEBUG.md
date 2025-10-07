# Stripe Setup Debug Guide

## 🔍 **Debug Steps**

### 1. **Check Environment Variables**
Visit: `http://localhost:3002/api/debug/stripe-config`

This will show you which environment variables are missing.

### 2. **Required Environment Variables**
Add these to your `.env.local` file:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_xxx               # Your Stripe platform secret key
NEXT_PUBLIC_SITE_URL=http://localhost:3002  # For local development
```

### 3. **Get Your Stripe Keys**
1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Go to **Developers** → **API Keys**
3. Copy your **Secret key** (starts with `sk_test_` or `sk_live_`)

### 4. **Test the Connection**
After setting environment variables:
1. Restart your development server: `npm run dev`
2. Go to `/admin/payments`
3. Click "Connect Stripe Account"

## 🚨 **Common Issues**

### **Issue 1: Environment Variables Not Set**
**Error**: "Stripe configuration missing"
**Solution**: Add `STRIPE_SECRET_KEY` to `.env.local`

### **Issue 2: Site URL Not Set**
**Error**: "Site URL configuration missing"
**Solution**: Add `NEXT_PUBLIC_SITE_URL=http://localhost:3002` to `.env.local`

### **Issue 3: Database Migration Not Run**
**Error**: Database errors
**Solution**: Run the database migration first

## 📋 **Complete Setup Checklist**

- [ ] Add `STRIPE_SECRET_KEY` to `.env.local`
- [ ] Add `NEXT_PUBLIC_SITE_URL` to `.env.local`
- [ ] Restart development server
- [ ] Run database migration (if not done)
- [ ] Test connection at `/admin/payments`

## 🔧 **Environment File Example**

Create `.env.local` in your project root:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_51ABC123...
NEXT_PUBLIC_SITE_URL=http://localhost:3002

# Your existing Supabase variables
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## 🎯 **Next Steps**

1. **Set up environment variables**
2. **Restart your server**
3. **Test the connection**
4. **Configure Stripe Dashboard** (for production)

The debug endpoint will help you identify exactly what's missing!

