# Booking Management Setup

This document explains how to set up the "Manage Booking" feature for your tenant customers.

## 🚀 Quick Setup

### 1. Environment Variables

Add this to your `.env.local` and production environment:

```bash
BOOKING_SESSION_SECRET=your-super-secret-random-string-here-make-it-long-and-random
```

**Important**: Use a long, random string (at least 32 characters). You can generate one with:
```bash
openssl rand -base64 32
```

### 2. Database Schema

Run the SQL scripts to set up the required database structure:

```sql
-- 1. Add required columns to bookings table
\i supabase-migrations/add-booking-management-columns.sql

-- 2. Create the secure RPC function for updates
\i supabase-migrations/create-update-customer-booking-rpc.sql
```

Or manually add these columns to your `bookings` table:
- `phone` (text)
- `vehicle_reg` (text) 
- `car_make` (text)
- `car_model` (text)
- `car_color` (text)
- `flight_number` (text)
- `dropoff_time` (text) - stores time as "HH:MM" format
- `pickup_time` (text) - stores time as "HH:MM" format

The RPC function `update_customer_booking` provides:
- **Tenant isolation**: Ensures users can only update their tenant's bookings
- **Field validation**: Only allows updating specific fields
- **Audit trail**: Automatically updates `updated_at` timestamp
- **Error handling**: Safe error messages without exposing internals

### 3. Test the Feature

1. Go to any tenant site: `/sites/[slug]/manage-booking`
2. Enter a booking reference and last name
3. Update the booking details
4. Verify changes are saved

## 🔒 Security Features

- **JWT-based sessions**: Short-lived (30 minutes) secure cookies
- **Tenant isolation**: Users can only access their own tenant's bookings
- **Field whitelisting**: Only specific fields can be updated
- **Name verification**: Simple last name matching for authentication
- **No date changes**: Customers cannot modify booking dates
- **RPC function security**: Database-level validation and tenant isolation
- **Audit trail**: Automatic `updated_at` timestamp tracking

## 🎯 How It Works

1. **Customer visits** `/sites/[slug]/manage-booking`
2. **Enters booking reference** and last name
3. **System verifies** the booking exists and name matches
4. **Creates secure session** with JWT cookie (30 min expiry)
5. **Customer can edit** vehicle details, contact info, and times
6. **Changes are saved** to the database with tenant isolation

## 🔧 Customization

### Allowed Fields
Edit `src/app/api/manage-booking/update/route.ts` to modify which fields customers can update:

```typescript
const ALLOWED: Record<string, true> = {
  vehicle_reg: true,
  car_make: true,
  car_model: true,
  car_color: true,
  phone: true,
  flight_number: true,
  dropoff_time: true,
  pickup_time: true,
  // Add more fields here
};
```

### Session Duration
Change the session timeout in `src/app/api/manage-booking/login/route.ts`:

```typescript
const TTL_MINUTES = 30; // Change this value
```

### Styling
The page uses your existing tenant site styling and components. It will automatically match your site's theme.

## 📧 Email Integration

To add "Manage Booking" links to confirmation emails, include this URL:
```
https://yourdomain.com/sites/[tenant-slug]/manage-booking
```

## 🚨 Security Considerations

- **Rate limiting**: Consider adding rate limiting to the login endpoint
- **Strong secrets**: Use a cryptographically secure random string for `BOOKING_SESSION_SECRET`
- **HTTPS only**: Ensure cookies are only sent over HTTPS in production
- **Session expiry**: Sessions automatically expire after 30 minutes

## 🐛 Troubleshooting

### "Booking not found" error
- Check that the booking reference exists in the database
- Verify the tenant slug matches the booking's tenant
- Ensure the customer name matches (case-insensitive, last name only)

### "Not authenticated" error
- Session may have expired (30 minutes)
- Try logging in again
- Check that `BOOKING_SESSION_SECRET` is set correctly

### Database errors
- Ensure all required columns exist in the bookings table
- Check that the user has proper permissions on the bookings table
- Verify RLS policies allow the operations

## 🔄 Future Enhancements

- **Email verification**: Send one-time edit links via email
- **Rate limiting**: Add brute force protection
- **Audit logging**: Track who made changes and when
- **Booking summary**: Show read-only booking details
- **SMS verification**: Add phone number verification
