# Parking Channel

A multi-tenant parking management system built with Next.js 14, Supabase, and TypeScript.

## Features

- **Multi-tenant Architecture**: Each parking business gets its own isolated environment
- **Real-time Dashboard**: Today's arrivals, departures, and capacity management
- **Booking Management**: Create, update, and track parking bookings
- **Hardware Integration**: ANPR and QR code gate systems
- **Third-party Integrations**: ParkVia and Holiday Extras channel management
- **Stripe Connect Integration**: Payment processing with connected accounts
- **Bulk Upload**: CSV/XLSX import for booking data
- **Role-based Access**: Owner, Admin, and Staff roles
- **Audit Logging**: Complete audit trail for all operations

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Supabase (PostgreSQL, Auth, Storage)
- **Database**: PostgreSQL with Row Level Security (RLS)
- **Authentication**: Supabase Auth
- **UI Components**: Radix UI, Lucide React icons
- **Validation**: Zod schemas
- **Date Handling**: date-fns with timezone support

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (marketing)/       # Landing pages (optional)
│   ├── login/             # Authentication
│   ├── signup/
│   ├── onboarding/        # Tenant setup flow
│   ├── admin/             # Admin dashboard
│   │   ├── today/         # Today's operations
│   │   ├── bookings/      # Booking management
│   │   ├── uploads/       # Bulk upload wizard
│   │   ├── integrations/  # Third-party integrations
│   │   ├── devices/       # Gate device management
│   │   └── settings/      # Tenant settings
│   └── api/               # API routes
│       ├── tenant/        # Tenant resolution
│       ├── bookings/      # Booking CRUD
│       ├── anpr/          # ANPR hardware endpoint
│       ├── qr/            # QR code hardware endpoint
│       ├── webhooks/      # Third-party webhooks
│       └── cron/          # Scheduled jobs
├── lib/                   # Core utilities
│   ├── supabase/          # Supabase clients
│   ├── auth/              # Authentication helpers
│   ├── tenant/            # Tenant resolution
│   ├── rls/               # Row Level Security
│   └── validation/        # Zod schemas
└── components/            # React components
    ├── ui/                # Base UI components
    └── admin/             # Admin-specific components
```

## Setup Instructions

### 1. Prerequisites

- Node.js 18+ and npm
- Supabase account and project
- Domain for multi-tenant setup (optional for development)

### 2. Environment Variables

Create a `.env.local` file:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# App Configuration
APP_BASE_DOMAIN=yourdomain.com
ENCRYPTION_KEY=your_32_character_encryption_key

# Stripe Connect (Required for payments)
STRIPE_SECRET_KEY=sk_test_***
STRIPE_PUBLISHABLE_KEY=pk_test_***
NEXT_PUBLIC_ROOT_URL=https://yourdomain.com

# Optional: For development
NEXT_PUBLIC_APP_BASE_DOMAIN=localhost:3000
```

### 3. Database Setup

1. Run the SQL schema in your Supabase SQL editor:

```bash
# Copy the contents of supabase-schema.sql and run in Supabase
```

2. The schema includes:
   - All required tables with proper relationships
   - Row Level Security policies
   - Indexes for performance
   - Initial channel data (ParkVia, Holiday Extras)

### 4. Install Dependencies

```bash
npm install
```

### 5. Development

```bash
npm run dev
```

Visit `http://localhost:3000` to start the application.

## Usage

### 1. First-time Setup

1. Sign up for a new account
2. Complete the onboarding flow:
   - Create your parking business
   - Set timezone and URL slug
   - Optionally invite team members
3. Access your dashboard at `{slug}.localhost:3000`

### 2. Managing Bookings

- **Today View**: See arrivals and departures for the current day
- **Bookings Page**: Full booking management with search and filters
- **Bulk Upload**: Import bookings from CSV/XLSX files
- **Manual Entry**: Create individual bookings

### 3. Hardware Integration

- **ANPR Systems**: Configure devices with API keys
- **QR Codes**: Generate QR codes for bookings
- **Gate Events**: Monitor all gate interactions

### 4. Third-party Integrations

- **ParkVia**: Set up API credentials and webhook endpoints
- **Holiday Extras**: Configure channel accounts
- **Stripe Connect**: Payment processing with connected accounts
- **Webhooks**: Receive real-time booking updates
- **Cron Jobs**: Scheduled data synchronization

### 5. Stripe Connect Setup

For payment processing, set up Stripe Connect:

1. **Get Stripe Keys**: Create a Stripe account and get your API keys
2. **Set Environment Variables**: Add Stripe keys to your environment
3. **Test the Setup**: Visit `/admin/payments` to connect Stripe accounts
4. **Complete Onboarding**: Follow the Stripe onboarding flow for each tenant

The system integrates with your existing pricing engine - no product duplication required.

See [STRIPE_INTEGRATED_SETUP.md](./STRIPE_INTEGRATED_SETUP.md) for detailed instructions.

## API Endpoints

### Tenant Resolution
- `GET /api/tenant/resolve` - Resolve tenant from domain or query parameter

### Bookings
- `POST /api/bookings/list` - List bookings with filters
- `POST /api/bookings/create` - Create new booking
- `POST /api/bookings/update` - Update existing booking
- `POST /api/bookings/delete` - Cancel booking
- `POST /api/bookings/upload` - Bulk upload bookings

### Hardware
- `POST /api/anpr` - ANPR gate system endpoint
- `POST /api/qr` - QR code gate system endpoint

### Webhooks
- `POST /api/webhooks/parkvia` - ParkVia webhook handler
- `POST /api/webhooks/holidayextras` - Holiday Extras webhook handler
- `POST /api/stripe/webhook` - Stripe webhook handler

### Stripe Connect (Integrated)
- `POST /api/payments/connect/onboard` - Create/onboard connected account
- `GET /api/payments/connect/status` - Get connection status
- `POST /api/payments/checkout` - Create checkout for booking
- `POST /api/payments/booking-extension` - Pay for booking extension

### Cron Jobs
- `GET /api/cron/pull-parkvia` - Sync ParkVia data
- `GET /api/cron/pull-holidayextras` - Sync Holiday Extras data

## Security Features

- **Row Level Security**: Database-level tenant isolation
- **API Key Authentication**: For hardware endpoints
- **Webhook Signature Verification**: For third-party integrations
- **Audit Logging**: Complete operation history
- **Role-based Access**: Granular permissions

## Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Environment Variables for Production

```env
NEXT_PUBLIC_SUPABASE_URL=your_production_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_production_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_production_service_role_key
APP_BASE_DOMAIN=yourdomain.com
ENCRYPTION_KEY=your_production_encryption_key
```

### Cron Jobs

Set up Vercel Cron functions for data synchronization:

```json
{
  "crons": [
    {
      "path": "/api/cron/pull-parkvia",
      "schedule": "0 */6 * * *"
    },
    {
      "path": "/api/cron/pull-holidayextras", 
      "schedule": "0 */6 * * *"
    }
  ]
}
```

## Development Notes

### Tenant Resolution

The system resolves tenants through:
1. Domain name lookup in `tenant_domains` table
2. Fallback to `?tenant=slug` query parameter
3. Clear error if no tenant found

### Row Level Security

All data access is protected by RLS policies that:
- Check user membership in `user_tenants` table
- Filter by `tenant_id` automatically
- Enforce role-based permissions

### Timezone Handling

- All dates stored in UTC
- Tenant timezone used for display and calculations
- Proper timezone conversion in API endpoints

### Encryption

Third-party API credentials are encrypted using the `ENCRYPTION_KEY` environment variable.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.