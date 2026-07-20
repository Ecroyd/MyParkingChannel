import { describe, it, expect } from 'vitest';
import { looksLikeParkViaEmail, parkViaEmailBodyToStaging } from '../parkviaEmailBodyToStaging';

describe('ParkVia/ParkCloud Source Detection', () => {
  it('should detect ParkVia from email address', () => {
    expect(
      looksLikeParkViaEmail({
        from_address: 'notifications@parkvia.com',
        subject: null,
        body: null,
      })
    ).toBe(true);
  });

  it('should detect ParkCloud from email address', () => {
    expect(
      looksLikeParkViaEmail({
        from_address: 'notifications@parkcloud.com',
        subject: null,
        body: null,
      })
    ).toBe(true);
  });

  it('should detect ParkVia from subject', () => {
    expect(
      looksLikeParkViaEmail({
        from_address: null,
        subject: 'ParkVia - Notification',
        body: null,
      })
    ).toBe(true);
  });

  it('should detect ParkCloud from subject', () => {
    expect(
      looksLikeParkViaEmail({
        from_address: null,
        subject: 'ParkCloud - Notification',
        body: null,
      })
    ).toBe(true);
  });

  it('should detect ParkVia from body content', () => {
    expect(
      looksLikeParkViaEmail({
        from_address: null,
        subject: null,
        body: 'ParkVia - New Booking Notification',
      })
    ).toBe(true);
  });

  it('should detect ParkCloud from body content', () => {
    expect(
      looksLikeParkViaEmail({
        from_address: null,
        subject: null,
        body: 'ParkCloud - New Booking Notification',
      })
    ).toBe(true);
  });

  it('should detect from body structure with booking fields and parkvia mention', () => {
    const body = `
ParkVia booking confirmation

Booking Ref: PV12345
Selected Car Park: Flyparks Exeter
Registration Number: AB12 CDE
Vehicle Drop-Off Date: 20/07/2026 10:00
Vehicle Pick-Up Date: 25/07/2026 15:00
    `;
    
    expect(
      looksLikeParkViaEmail({
        from_address: null,
        subject: null,
        body,
      })
    ).toBe(true);
  });

  it('should parse ParkVia email body', () => {
    const body = `
ParkVia - New Booking Notification

Booking Ref: PV12345
Selected Car Park: Flyparks Exeter
Total Price: £95.50
Amount Paid: £95.50
Vehicle Drop-Off Date: 20/07/2026 10:00
Vehicle Pick-Up Date: 25/07/2026 15:00
Name: John Smith
Mobile: 07777888999
Email: john.smith@example.com
Registration Number: AB12 CDE
Special Requests: Please park near entrance
    `;

    const result = parkViaEmailBodyToStaging(body);
    
    expect(result.reference).toBe('PV12345');
    expect(result.customer_name).toBe('John Smith');
    expect(result.customer_email).toBe('john.smith@example.com');
    expect(result.customer_phone).toBe('07777888999');
    expect(result.vehicle_reg).toBe('AB12CDE');
    expect(result.start_at).toBe('2026-07-20T10:00:00');
    expect(result.end_at).toBe('2026-07-25T15:00:00');
    expect(result.total_price).toBe(95.50);
    expect(result.money_received).toBe(95.50);
  });

  it('should handle forwarded ParkVia emails', () => {
    const forwarded = `
---------- Forwarded message ---------
From: notifications@parkvia.com
To: ops@flyparks.co.uk
Subject: ParkVia - Notification

Booking Ref: PV12345
Registration Number: AB12CDE
Vehicle Drop-Off Date: 20/07/2026 10:00
Vehicle Pick-Up Date: 25/07/2026 15:00
Name: John Smith
Total Price: £95.50
    `;

    expect(
      looksLikeParkViaEmail({
        from_address: 'notifications@parkvia.com',
        subject: 'Fwd: ParkVia - Notification',
        body: forwarded,
      })
    ).toBe(true);

    const result = parkViaEmailBodyToStaging(forwarded);
    expect(result.reference).toBe('PV12345');
  });

  it('should not detect generic emails as ParkVia', () => {
    expect(
      looksLikeParkViaEmail({
        from_address: 'booking@example.com',
        subject: 'Booking Confirmation',
        body: 'Your booking has been confirmed',
      })
    ).toBe(false);
  });

  it('should include special requests in notes', () => {
    const body = `
Booking Ref: PV12345
Registration Number: AB12CDE
Vehicle Drop-Off Date: 20/07/2026 10:00
Vehicle Pick-Up Date: 25/07/2026 15:00
Name: John Smith
Total Price: £95.50
Special Requests: Disabled parking required
Selected Car Park: Flyparks Exeter
    `;

    const result = parkViaEmailBodyToStaging(body);
    expect(result.notes).toContain('Special requests: Disabled parking required');
    expect(result.notes).toContain('Selected car park: Flyparks Exeter');
  });

  it('should handle missing optional fields', () => {
    const minimal = `
Booking Ref: PV12345
Registration Number: AB12CDE
Vehicle Drop-Off Date: 20/07/2026 10:00
Vehicle Pick-Up Date: 25/07/2026 15:00
Total Price: £95.50
    `;

    const result = parkViaEmailBodyToStaging(minimal);
    expect(result.reference).toBe('PV12345');
    expect(result.vehicle_reg).toBe('AB12CDE');
    expect(result.customer_name).toBeNull();
    expect(result.customer_email).toBeNull();
  });
});
