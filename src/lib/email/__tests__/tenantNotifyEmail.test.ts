import { describe, expect, it } from 'vitest';
import {
  isPlatformIngestEmail,
  normalizeEmailList,
  parseEmailList,
  partitionBookingNotifyEmails,
  resolveTenantBookingNotifyEmails,
} from '@/lib/email/tenantNotifyEmail';

describe('parseEmailList / normalizeEmailList', () => {
  it('parses comma and newline separated emails', () => {
    expect(
      parseEmailList('ops@example.com, info@site.co.uk\nbookings@site.co.uk')
    ).toEqual(['ops@example.com', 'info@site.co.uk', 'bookings@site.co.uk']);
  });

  it('dedupes case-insensitively and drops invalids', () => {
    expect(normalizeEmailList(['A@x.com', 'a@x.com', 'not-an-email', ''])).toEqual([
      'A@x.com',
    ]);
  });
});

describe('platform ingest addresses', () => {
  it('recognizes bookings@ and canary-bookings@ as ingest inboxes', () => {
    expect(isPlatformIngestEmail('bookings@myparkingchannel.app')).toBe(true);
    expect(isPlatformIngestEmail('Bookings@MyParkingChannel.app')).toBe(true);
    expect(isPlatformIngestEmail('canary-bookings@myparkingchannel.app')).toBe(true);
    expect(isPlatformIngestEmail('info@flyparksexeter.co.uk')).toBe(false);
    expect(isPlatformIngestEmail('bookings@site.co.uk')).toBe(false);
  });

  it('partitions ingest addresses out of notify lists', () => {
    expect(
      partitionBookingNotifyEmails([
        'info@flyparksexeter.co.uk',
        'bookings@myparkingchannel.app',
        'manager@example.com',
      ])
    ).toEqual({
      allowed: ['info@flyparksexeter.co.uk', 'manager@example.com'],
      blocked: ['bookings@myparkingchannel.app'],
    });
  });
});

describe('resolveTenantBookingNotifyEmails', () => {
  it('uses only the explicit booking_notify_emails list', () => {
    expect(
      resolveTenantBookingNotifyEmails({
        bookingNotifyEmails: ['info@flyparksexeter.co.uk', 'manager@example.com'],
        bookingNotifyEmail: 'legacy@example.com',
      })
    ).toEqual(['info@flyparksexeter.co.uk', 'manager@example.com']);
  });

  it('falls back to legacy singular column when array is empty', () => {
    expect(
      resolveTenantBookingNotifyEmails({
        bookingNotifyEmails: [],
        bookingNotifyEmail: 'legacy@example.com',
      })
    ).toEqual(['legacy@example.com']);
  });

  it('strips platform ingest addresses so they never become Resend To:', () => {
    expect(
      resolveTenantBookingNotifyEmails({
        bookingNotifyEmails: [
          'bookings@myparkingchannel.app',
          'info@flyparksexeter.co.uk',
        ],
      })
    ).toEqual(['info@flyparksexeter.co.uk']);
  });

  it('returns empty when only ingest addresses were configured', () => {
    expect(
      resolveTenantBookingNotifyEmails({
        bookingNotifyEmails: ['bookings@myparkingchannel.app'],
      })
    ).toEqual([]);
  });

  it('returns empty when nothing is configured (safe empty state)', () => {
    expect(
      resolveTenantBookingNotifyEmails({
        bookingNotifyEmails: null,
        bookingNotifyEmail: null,
      })
    ).toEqual([]);
  });

  it('does not invent recipients from unrelated fields', () => {
    // Type system only accepts booking notify fields — empty stays empty.
    expect(resolveTenantBookingNotifyEmails({})).toEqual([]);
  });
});
