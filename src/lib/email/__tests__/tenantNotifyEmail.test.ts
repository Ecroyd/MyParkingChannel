import { describe, expect, it } from 'vitest';
import {
  platformOpsEmails,
  resolveTenantBookingNotifyEmail,
} from '@/lib/email/tenantNotifyEmail';

describe('resolveTenantBookingNotifyEmail', () => {
  const ops = platformOpsEmails('ops@myparkingchannel.app');

  it('prefers the public profile contact over reply-to', () => {
    expect(
      resolveTenantBookingNotifyEmail(
        {
          profileEmail: 'info@flyparksexeter.co.uk',
          replyTo: 'ops@myparkingchannel.app',
        },
        ops
      )
    ).toBe('info@flyparksexeter.co.uk');
  });

  it('never sends booking notifications to platform ops', () => {
    expect(
      resolveTenantBookingNotifyEmail(
        {
          profileEmail: 'ops@myparkingchannel.app',
          replyTo: 'ops@myparkingchannel.app',
          brandingContactEmail: 'OPS@myparkingchannel.app',
        },
        ops
      )
    ).toBeNull();
  });

  it('uses explicit booking_notify_email first', () => {
    expect(
      resolveTenantBookingNotifyEmail(
        {
          bookingNotifyEmail: 'bookings@flyparksexeter.co.uk',
          profileEmail: 'info@flyparksexeter.co.uk',
          replyTo: 'ops@myparkingchannel.app',
        },
        ops
      )
    ).toBe('bookings@flyparksexeter.co.uk');
  });

  it('falls back to reply-to when it is a real tenant inbox', () => {
    expect(
      resolveTenantBookingNotifyEmail(
        {
          replyTo: 'info@flyparksexeter.co.uk',
        },
        ops
      )
    ).toBe('info@flyparksexeter.co.uk');
  });
});
