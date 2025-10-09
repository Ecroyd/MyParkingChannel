# Stripe Connect OAuth Fix

## 🎯 **The Problem**
When users complete Stripe onboarding on their phones, Stripe redirects to `localhost:3000` which doesn't work on mobile devices.

## ✅ **Fixes Applied**

### **1. Dynamic Redirect URI Generation**
Updated `/api/stripe/connect/route.ts` to:
- ✅ Detect the current host (tenant subdomain or main domain)
- ✅ Build the correct redirect URI dynamically
- ✅ Support both localhost (development) and production domains

### **2. Dynamic Callback Redirects**
Updated `/api/stripe/callback/route.ts` to:
- ✅ Redirect back to the correct tenant subdomain
- ✅ Handle errors with proper domain redirects
- ✅ Support both localhost and production

## 🚀 **How It Works Now**

### **For Main Domain (`myparkingchannel.app`)**
```
User clicks "Connect Stripe" → 
Stripe OAuth with redirect_uri=https://myparkingchannel.app/api/stripe/callback →
User completes onboarding →
Redirects back to https://myparkingchannel.app/admin/payments
```

### **For Tenant Subdomains (`flyparksexeter.myparkingchannel.app`)**
```
User clicks "Connect Stripe" → 
Stripe OAuth with redirect_uri=https://flyparksexeter.myparkingchannel.app/api/stripe/callback →
User completes onboarding →
Redirects back to https://flyparksexeter.myparkingchannel.app/admin/payments
```

## 🔧 **Stripe Dashboard Configuration**

### **Required Redirect URIs**
Add these to your Stripe Dashboard → Developers → Settings → OAuth:

**For Live Mode:**
```
https://myparkingchannel.app/api/stripe/callback
https://*.myparkingchannel.app/api/stripe/callback
```

**For Test Mode:**
```
https://myparkingchannel.app/api/stripe/callback
https://*.myparkingchannel.app/api/stripe/callback
```

### **Environment Variables**
Make sure these are set in Vercel:

```bash
# Stripe Keys
STRIPE_SECRET_KEY_LIVE=sk_live_xxx
STRIPE_SECRET_KEY_TEST=sk_test_xxx

# App URL (for fallback)
NEXT_PUBLIC_SITE_URL=https://myparkingchannel.app
```

## 🧪 **Testing**

### **Test on Main Domain**
1. Visit: `https://myparkingchannel.app/admin/payments`
2. Click "Connect Stripe Account"
3. Complete Stripe onboarding
4. Should redirect back to main domain

### **Test on Tenant Subdomain**
1. Visit: `https://flyparksexeter.myparkingchannel.app/admin/payments`
2. Click "Connect Stripe Account"
3. Complete Stripe onboarding
4. Should redirect back to tenant subdomain

## 🔍 **Debugging**

If redirects still fail:

1. **Check Stripe Dashboard**: Ensure redirect URIs are configured
2. **Check Vercel Logs**: Look for OAuth errors
3. **Test URLs**: Verify the generated redirect URIs are correct

## 📱 **Mobile Testing**

The fix specifically addresses mobile issues:
- ✅ No more `localhost` redirects on mobile
- ✅ Proper HTTPS redirects for production
- ✅ Tenant-specific redirects work on mobile

## 🎉 **Result**

After deploying these changes:
- ✅ Stripe Connect works on mobile devices
- ✅ Redirects go to the correct tenant subdomain
- ✅ No more "Safari can't connect to server" errors
- ✅ Works for both main domain and tenant subdomains
