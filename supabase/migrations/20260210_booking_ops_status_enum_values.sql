-- Add missing ops_status enum values so Key Report and ops dropdown work.
-- App uses: arrived, no_show, take_key, arrived_key_taken, departed (see src/lib/opsStatuses.ts).
-- If your enum already has some of these, comment out or remove the corresponding line(s).

ALTER TYPE booking_ops_status ADD VALUE IF NOT EXISTS 'take_key';
ALTER TYPE booking_ops_status ADD VALUE IF NOT EXISTS 'arrived_key_taken';
