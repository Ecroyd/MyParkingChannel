-- Backfill parse_outcome and parse_reason for existing rows
-- Run this in Supabase SQL editor after adding the columns

-- 1) Backfill image attachments: mark as skipped instead of failed
update ingest_email_files
set
  parse_outcome = 'skipped',
  parse_reason  = 'non_booking_attachment:image',
  parse_status  = 'parsed'  -- important: stop UI showing as failed
where
  (parse_outcome is null)
  and filename ~* '\.(png|jpg|jpeg|gif|webp|svg|ico)$';

-- 2) Backfill remaining rows:
-- If parse_status is failed, call them failed; otherwise parsed.
update ingest_email_files
set
  parse_outcome = case
    when parse_outcome is not null then parse_outcome
    when parse_status = 'failed' then 'failed'
    when parse_status = 'parsed' then 'parsed'
    else 'parsed'
  end,
  parse_reason = case
    when parse_reason is not null then parse_reason
    when parse_status = 'failed' then 'parse_failed:unknown'
    else null
  end
where parse_outcome is null;
