# Supplier API Test Suggestions

## Already Tested ✅
- Basic booking creation (200 random requests)
- Availability checks
- Booking amendments (customer/vehicle details)
- Booking cancellations
- Capacity limits (overlapping dates)
- Dynamic pricing (gradual occupancy increase)

## Recommended Additional Tests

### 1. **Error Handling & Validation**
- Invalid/missing required fields (product_id, start_at, end_at, customer)
- Malformed dates (invalid format, past dates, end before start)
- Invalid product_id (non-existent, wrong tenant)
- Invalid API key (missing, wrong format, expired, wrong tenant)
- Invalid currency codes
- Negative prices
- Very large prices
- Missing customer fields (no email, no name)

### 2. **Edge Cases - Dates & Times**
- Same-day bookings (arrive and depart same day)
- Very short stays (1 hour, 2 hours)
- Very long stays (100+ days, test the >30 day logic)
- Bookings spanning multiple seasons
- Bookings at midnight (00:00:00)
- Bookings at year boundaries (Dec 31 → Jan 1)
- Leap year dates (Feb 29)
- Timezone edge cases (UTC vs local time)

### 3. **Idempotency & Duplicates**
- Duplicate external_reference (should return existing booking)
- Same external_reference with different data (should it update or reject?)
- Rapid duplicate requests (race condition testing)

### 4. **Concurrent Requests**
- Multiple simultaneous bookings for same dates (race conditions)
- Booking creation while checking availability
- Amendment while another amendment is in progress
- Cancellation while amendment is in progress

### 5. **Boundary Conditions**
- Exactly at capacity (50 bookings when capacity = 50)
- Just over capacity (51 bookings when capacity = 50)
- Just under capacity (49 bookings when capacity = 50)
- Zero capacity dates
- Capacity changes during booking creation

### 6. **Data Validation**
- Special characters in names (é, ñ, ü, emojis)
- Very long names/emails/plates
- Invalid email formats
- Invalid phone number formats
- UK vs international number plates
- SQL injection attempts in text fields
- XSS attempts in text fields

### 7. **API Endpoints**
- GET booking by reference (retrieve existing booking)
- GET booking with invalid reference
- PATCH booking with invalid reference
- PATCH booking with invalid fields
- POST cancel on already cancelled booking
- POST cancel on checked-in booking (should fail)

### 8. **Channel & Pricing**
- Different channels (agent, web, etc.) - verify different pricing
- Channel-specific availability
- Price mismatches (booking with wrong price from availability)

### 9. **Business Logic**
- Booking amendments after check-in (should fail)
- Booking cancellations after check-in (should fail)
- Booking amendments to cancelled bookings (should fail)
- Booking amendments to past dates (should fail)

### 10. **Performance & Load**
- 1000 rapid sequential requests
- 100 concurrent requests
- Very large date ranges (availability for 365 days)
- Multiple availability checks for same dates

### 11. **Integration Scenarios**
- Create → Amend → Cancel (full lifecycle)
- Create → Check availability → Create (verify capacity updates)
- Create multiple bookings → Check availability → Verify capacity decreases
- Cancel booking → Check availability → Verify capacity increases

### 12. **Data Integrity**
- Booking with price that doesn't match availability response
- Booking creation with future dates beyond capacity horizon
- Bookings on closed dates (should be rejected)

