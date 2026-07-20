# Flyparks Booking Ingestion Architecture Investigation

## Part 1: Architecture Audit

### Inbound Email Flow

**Entry Point**: Cloudflare Worker → `/api/internal/email/process` route
- Worker sends `raw_rfc822_base64` to the API
- Email row created in `ingest_emails` table
- `processIngestEmail()` in `/src/lib/ingest/processIngestEmail.ts` handles MIME parsing

**Email Parsing Pipeline** (`processIngestEmail`):
1. Parse MIME using `simpleParser` from mailparser
2. Detect tenant from `to_address` via `tenant_inbound_inboxes` table
3. Extract attachments (CSV, PDF, XLS, XLSX)
4. Store in `ingest_email_parses` with guessed reference/plate
5. Store attachments in `ingest_email_files` + Supabase storage

**Source Detection**:
- `looksLikeFlyparksDirectEmail()` - checks for "***BOOKING RECEIPT***", "YOUR BOOKING REFERENCE", "Drop off date"
- `looksLikeParkViaEmail()` - checks for "parkvia" in `from_address`, "ParkVia - Notification" subject
- Attachment-based: filename patterns (EXT1, EXTZ10, CAVU, APH)

### Attachment Parsing

**File**: `/src/lib/ingest/parseEmailFile.ts`
- Downloads from storage
- Calls `detectAndMapFromAttachment()` from canonical mappers
- Writes to `booking_import_staging`
- Calls `promoteStagingToBookings()` for upsert

**Canonical Mappers** (`/src/lib/importers/canonical/mappers.ts`):
- APH
- CAVU  
- Holiday Extras (EXT1 TSV)
- Holiday Extras EXTZ10 (tab-delimited)
- Flyparks email body

### Parsers

#### **Flyparks Direct** (`/src/lib/ingest/flyparksTextToStaging.ts`):
- Current format: older confirmation email style
- Parses: Reference, Customer name (from "Dear..."), Drop off/Pick up date/time, Vehicle Details, Total Cost
- **Missing**: New "***BOOKING RECEIPT***" format support

#### **Holiday Extras** (`/src/lib/importers/holidayExtras/parseHolidayExtras.ts`):
- EXT1: TSV with variable offset detection
- **EXTZ10**: Tab-delimited with record code "06" and action codes (1=new, 2=amend, 3=cancel)
- Current EXTZ10 parser: `parseHolidayExtrasExtz10Text()`
  - Line 302: `toLocalIsoFromYYMMDD(f[4], f[8], 1)` - **correctly adds 1 day to hotel night date**
  - Returns canonical booking with `external_status`: "new", "amended", "cancelled"

#### **ParkVia** (`/src/lib/ingest/parkviaEmailBodyToStaging.ts`):
- Parses email body fields: Booking Ref, Name, Mobile, Email, Registration Number, Drop-Off/Pick-Up Date
- Source detection: `/parkvia/i.test(from)` or subject pattern
- **Issue**: Source normalization inconsistency

### Staging → Bookings Upsert

**Path**: `promoteStagingToBooking` → `upsertBookingFromStagingRow` → `bookingFromStaging.ts`

**Dedupe Key**: `tenant_id + reference` (normalized uppercase)

**Status Mapping** (`/src/lib/ingest/importStatusMapping.ts`):
- `normalizeSupplierStatus()`: Maps FIRM/NEW/AMND/CANX/CANCELLED to tokens
- `mapSupplierStatusToBookingStatus()`: Maps to booking.status enum

**Source Normalization** (`/src/lib/bookings/normalizeBookingSource.ts`):
- Maps: `holiday_extras`, `aph`, `cavu`, `parkvia`, `direct`, `manual`, `supplier_api`, `other`
- **Supported values**: "direct", "parkvia", "holiday_extras", "holidayextras", "manual", "other", "cavu", "aph", "supplier_api"

**Amendment/Cancellation Handling**:
- Currently in `promoteStagingToBookings.ts` RPC wrapper
- Amendments: Updates existing booking by tenant_id + reference
- Cancellations: Calls `applyBookingCancellation()` → sets `status='cancelled'`, `gate_status='cancelled'`

### Dashboard APIs

#### **Demand Curve** (`/src/app/api/analytics/demand-curve/route.ts`):
- Query params: `from`, `to`, `tenant_id`, `debug`
- Calls `computeDemandMetricsForWindow()`
- Uses `enumerateDateKeys(from, to)` to generate day list
- `loadDemandBookingsForWindow()`: Queries bookings with overlap condition `lt('start_at', windowEnd).gt('end_at', windowStart)`
- **Issue**: No limit, relies on date range boundaries

#### **Today Overview** (`/src/lib/today/loadTodayData.ts`):
- Server-side data loading for arrivals, departures, currently parked
- Uses exclusive range end: `withRangeEnd(query, 'start_at', rangeEnd).lt()` 
- No React Query/SWR - **uses Next.js `router.refresh()`** for cache invalidation

#### **Client Caching**:
- `DemandCurve.tsx`: useState + useEffect with visibilitychange listener
- `TodayPageClient.tsx`: `router.refresh()` on booking update
- **No React Query or SWR** - relying on Next.js server component refresh

### Database Schema

**Relevant tables**:
- `ingest_emails` - raw email metadata
- `ingest_email_parses` - parsed body text, guessed fields
- `ingest_email_files` - attachment metadata + parse status
- `booking_import_staging` - parsed booking rows before promotion
- `bookings` - final booking records
- `tenant_inbound_inboxes` - email→tenant mapping

**Diagnostics fields on `ingest_email_files`**:
- `parser_key` - which parser matched
- `detected_source` - supplier detected
- `parse_status` - pending/parsed/failed
- `parse_outcome` - parsed/empty/skipped
- `parse_reason` - summary of result
- `parse_error` - error message

---

## Identified Issues

### 1. **Flyparks Direct New Format Not Supported**
- Current parser expects "Reference:", "Departure date:", "Return date:"
- New format uses "YOUR BOOKING REFERENCE PF41180" (no colon), "Drop off date", "Pick up date", "Vehicle Details: . . . WD12HBN"
- Missing title stripping (MR, MRS, MS, MISS, DR)

### 2. **EXTZ10 Parsing Issues**
- Parser exists and works correctly for date arithmetic (hotel night + 1 day)
- **Potential issue**: Fixed-width vs tab-delimited ambiguity
- Amendment/cancellation promotion path exists but needs testing

### 3. **ParkVia/ParkCloud Source Mismatch**
- `processIngestEmail.ts` line 356: `source: "parkvia"`
- `normalizeBookingSource.ts` line 63: expects `"parkvia"`
- `looksLikeParkViaEmail()`: checks `/parkvia/i.test(from)`
- **Likely issue**: ParkCloud emails don't match detection pattern, or source string differs

### 4. **Demand Curve 90-Day Bug**
- `DemandCurve.tsx` line 132-134:
  ```ts
  case 'next90days': {
    const nextQuarter = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
    return { from: todayStr, to: nextQuarter.toISOString().split('T')[0] };
  }
  ```
- **Uses millisecond arithmetic** - unsafe across DST boundaries
- Should use `enumerateDateKeys(from, to)` which expects **inclusive** `to` date
- API generates exactly `enumerateDateKeys(from, to).length` days
- **Root cause**: 90 days from today = today + 90 days, giving 91 total days, but likely truncation or off-by-one

### 5. **Stale Today View After Bulk Updates**
- `TodayPageClient.tsx` line 56-58:
  ```ts
  const handleBookingUpdated = () => {
    router.refresh()
  }
  ```
- Uses Next.js `router.refresh()` which only revalidates server components
- No query key invalidation for demand curve or other widgets
- Manual refresh works because it forces full page reload

### 6. **Missing Tests**
- No test files for:
  - Flyparks Direct new format
  - EXTZ10 amendments/cancellations
  - ParkVia source detection
  - Demand curve date range generation
  - Cache invalidation

---

## Root Causes

1. **Flyparks Direct**: Parser regex doesn't handle new format variations
2. **EXTZ10**: Likely working but needs idempotency testing
3. **ParkVia/ParkCloud**: Email detection pattern too narrow, or alias missing
4. **90-day bug**: Millisecond date arithmetic + possible inclusive/exclusive boundary confusion
5. **Stale cache**: No centralized state invalidation, relying on server component refresh only
6. **Testing**: No automated coverage for ingestion edge cases

---

## Next Steps

1. Extend Flyparks Direct parser for new format
2. Add ParkCloud alias to ParkVia detection
3. Fix demand curve date range calculation (use calendar arithmetic)
4. Improve cache invalidation (add explicit refetch on navigation)
5. Add comprehensive test suite
6. Verify EXTZ10 amendment/cancellation flow
