# Stripe Environment-Based Setup

## ✅ **Environment-Aware Implementation**

Your Stripe Connect implementation now automatically uses different client IDs based on the environment:

### **🔧 Development Environment**
- **Client ID**: Uses `STRIPE_CLIENT_ID` from environment variables
- **URL**: `https://connect.stripe.com/oauth/v2/authorize?client_id={dev_client_id}&...`

### **🚀 Production Environment**  
- **Client ID**: Uses hardcoded live client ID `ca_TBxxxSmeoiiU1clxQQUO0SzIXuYw335v`
- **URL**: `https://connect.stripe.com/oauth/v2/authorize?client_id=ca_TBxxxSmeoiiU1clxQQUO0SzIXuYw335v&...`

## 📋 **Environment Variables**

### **Development (.env.local)**
```bash
# Required for development
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_CLIENT_ID=ca_test_xxx                    # Your test client ID
NEXT_PUBLIC_SITE_URL=http://localhost:3002

# Your existing Supabase variables
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### **Production (.env.production)**
```bash
# Required for production
STRIPE_SECRET_KEY=sk_live_xxx                   # Your live secret key
NEXT_PUBLIC_SITE_URL=https://myparkingchannel.app

# Your existing Supabase variables
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Note: STRIPE_CLIENT_ID not needed in production (uses hardcoded live ID)
```

## 🎯 **How It Works**

### **Development Flow**
1. Tenant clicks "Connect Stripe Account"
2. Redirects to: `/api/stripe/connect?tenant_id={tenantId}`
3. Builds OAuth URL with **development client ID**
4. Redirects to Stripe's test environment

### **Production Flow**
1. Tenant clicks "Connect Stripe Account"  
2. Redirects to: `/api/stripe/connect?tenant_id={tenantId}`
3. Builds OAuth URL with **live client ID** (`ca_TBxxxSmeoiiU1clxQQUO0SzIXuYw335v`)
4. Redirects to Stripe's live environment

## 🔑 **Get Your Keys**

### **Development Keys**
1. Go to [Stripe Dashboard](https://dashboard.stripe.com) (Test Mode)
2. **Secret Key**: Developers → API Keys → Secret key (starts with `sk_test_`)
3. **Client ID**: Connect → Settings → Client ID (starts with `ca_test_`)

### **Production Keys**
1. Go to [Stripe Dashboard](https://dashboard.stripe.com) (Live Mode)
2. **Secret Key**: Developers → API Keys → Secret key (starts with `sk_live_`)
3. **Client ID**: Already hardcoded as `ca_TBxxxSmeoiiU1clxQQUO0SzIXuYw335v`

## 🚀 **Testing**

### **Local Development**
```bash
NODE_ENV=development npm run dev
```
- Uses development client ID from environment
- Connects to Stripe test environment

### **Production Deployment**
```bash
NODE_ENV=production npm run build
```
- Uses hardcoded live client ID
- Connects to Stripe live environment

## ✅ **Benefits**

- ✅ **Automatic environment detection**
- ✅ **No manual client ID switching**
- ✅ **Secure production keys**
- ✅ **Easy development setup**

Your implementation is now environment-aware and ready for both development and production! 🎉
