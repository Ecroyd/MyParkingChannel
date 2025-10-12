-- Add customer_phone field to bookings table
ALTER TABLE public.bookings 
ADD COLUMN customer_phone text null;

-- Add index for phone number searches
CREATE INDEX IF NOT EXISTS idx_bookings_customer_phone ON public.bookings USING btree (customer_phone);

-- Add index for tenant + phone searches
CREATE INDEX IF NOT EXISTS idx_bookings_tenant_phone ON public.bookings USING btree (tenant_id, customer_phone);
