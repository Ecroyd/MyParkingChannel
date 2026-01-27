-- Add booking_modal_style column to sites table
-- Run this in Supabase SQL Editor

ALTER TABLE sites 
ADD COLUMN IF NOT EXISTS booking_modal_style TEXT 
CHECK (booking_modal_style IN ('card', 'banner') OR booking_modal_style IS NULL);

-- Add a comment to document the column
COMMENT ON COLUMN sites.booking_modal_style IS 'Booking modal style preference: card (default) or banner';

-- Set default to 'card' for existing sites
UPDATE sites 
SET booking_modal_style = 'card' 
WHERE booking_modal_style IS NULL;
