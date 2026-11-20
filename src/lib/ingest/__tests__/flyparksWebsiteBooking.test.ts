import { describe, it, expect } from 'vitest';
import {
  flyparksTextToStaging,
  looksLikeFlyparksDirectEmail,
  normalizeFlyparksEmailText,
} from '../flyparksTextToStaging';
import { extractFlyparksReceiptFromForward } from '@/lib/email/flyparksForward';

// Website booking notification introduced Nov 2026 ("New Website Booking: <ref>"), forwarded by the
// office. A summary block (Name / From / To / Total) sits above the customer confirmation copy.
// Customer details are made up; layout follows the real email.
const SUBJECT = 'FW: New Website Booking: 41358';

const PLAIN = `Kind Regards

Fly Parks Exeter

 <https://www.flyparksexeter.co.uk/> https://www.flyparksexeter.co.uk

From: Flyparks Exeter Ltd Website <website@flyparksexeter.co.uk>
Sent: 17 November 2026 12:09
To: info@flyparksexeter.co.uk
Subject: New Website Booking: 41358

A new website booking has been received.

Reference: 41358
Charge: ch_TESTCHARGE000000000000
Name: Testperson
Email: test.customer@example.com <mailto:test.customer@example.com>
Mobile: 07700900123
From: 14/12/2026
To: 21/12/2026
Days: 8
Total: £100.99

Customer confirmation send: OK

  _____

Customer confirmation (office copy)

The message below is the same confirmation sent to the customer
(test.customer@example.com <mailto:test.customer@example.com> ).

Booking Confirmation - ***BOOKING RECEIPT***

Thank you for your booking with Flyparks
Your transaction has been completed.

This email is your booking receipt and confirmation of your booking.

Your details:
Testperson
test.customer@example.com <mailto:test.customer@example.com>

07700900123

Departure date:

14/12/2026

Arrival time:

07:30

Return date:

21/12/2026

Return time:

14:50

Return flight number:

TOM6171

Vehicle model:

BMW i3s

Vehicle colour:

Red

Vehicle registration:

AB12 CDE

Reference:

41358

Days:

8

Parking Cost:

£99.00

Product:

PARKING WITH LATE RETURN COVER FOR UP TO 48 HOURS

Product Base Cost:

£1.99

Total Cost:

£100.99

If any of these details are incorrect or change, please email
info@flyparksexeter.co.uk <mailto:info@flyparksexeter.co.uk>

Arrival Procedures:

Drive in, our Automatic Number Plate Recognition (ANPR) system records your
number plate and validates your booking

  Flyparks`;

const row = (label: string, value: string) =>
  `<tr><td width="50%"><p class=MsoNormal><strong><span>${label}</span></strong> <o:p></o:p></p></td>` +
  `<td width="50%"><p class=MsoNormal><span style='color:#12157D'>${value}</span> <o:p></o:p></p></td></tr>`;

const HTML = `<html><body><div class=WordSection1>
<p class=MsoNormal>Kind Regards</p><p class=MsoNormal>Fly Parks Exeter</p>
<div><p class=MsoNormal><b><span>From:</span></b><span> Flyparks Exeter Ltd Website &lt;website@flyparksexeter.co.uk&gt; <br><b>Sent:</b> 17 November 2026 12:09<br><b>To:</b> info@flyparksexeter.co.uk<br><b>Subject:</b> New Website Booking: 41358</span></p></div>
<p class=MsoNormal style='margin-bottom:12.0pt'>A new website booking has been received.<br><br>Reference: 41358<br>Charge: ch_TESTCHARGE000000000000<br>Name: Testperson<br>Email: <a href="mailto:test.customer@example.com">test.customer@example.com</a><br>Mobile: 07700900123<br>From: 14/12/2026<br>To: 21/12/2026<br>Days: 8<br>Total: &pound;100.99<br><br>Customer confirmation send: OK</p>
<h3>Customer confirmation (office copy)</h3>
<p>The message below is the same confirmation sent to the customer (<a href="mailto:test.customer@example.com">test.customer@example.com</a>).</p>
<table><tr><td><table>
<tr><td><h2><span style='color:white'>Booking Confirmation - ***BOOKING RECEIPT***</span></h2></td></tr>
<tr><td><p><span>Thank you for your booking with&nbsp; Flyparks&nbsp;<br>Your transaction has been completed.</span></p></td></tr>
<tr><td width="50%" valign=top><p class=MsoNormal><strong><span>Your details:</span></strong> <br><span>Testperson <br><a href="mailto:test.customer@example.com">test.customer@example.com</a> <br><br><br><br>07700900123 </span></p></td>
<td width="50%" valign=top><table>
${row('Departure date:', '14/12/2026')}
${row('Arrival time:', '07:30 ')}
${row('Return date:', '21/12/2026')}
${row('Return time:', '14:50 ')}
${row('Return flight number:', 'TOM6171')}
${row('Vehicle model:', 'BMW i3s')}
${row('Vehicle colour:', 'Red')}
${row('Vehicle registration:', 'AB12 CDE')}
${row('Reference:', '41358')}
${row('Days:', '8')}
${row('Parking Cost:', '&pound;99.00')}
${row('Product:', 'PARKING WITH LATE RETURN COVER FOR UP TO 48 HOURS')}
${row('Product Base Cost:', '&pound;1.99')}
${row('Total Cost:', '&pound;100.99')}
</table></td></tr></table></td></tr></table>
<p>If any of these details are incorrect or change, please email info@flyparksexeter.co.uk</p>
</div></body></html>`;

// processIngestEmail normalises text + html together before extracting the receipt.
function ingestLike(subject: string, plain: string, html: string | null) {
  const text = normalizeFlyparksEmailText([plain, html ?? ''].filter(Boolean).join('\n'));
  const forwarded = extractFlyparksReceiptFromForward({ subject, text });
  return {
    detected: looksLikeFlyparksDirectEmail(subject, forwarded),
    staging: flyparksTextToStaging(forwarded),
  };
}

describe.each([
  ['plain text only', PLAIN, null],
  ['html only', '', HTML],
  ['plain text + html', PLAIN, HTML],
])('Flyparks "New Website Booking" email (%s)', (_label, plain, html) => {
  const { detected, staging } = ingestLike(SUBJECT, plain, html);

  it('is recognised as a Flyparks direct booking', () => {
    expect(detected).toBe(true);
  });

  it('extracts the booking', () => {
    expect(staging.reference).toBe('41358');
    expect(staging.start_at).toBe('2026-12-14T07:30:00');
    expect(staging.end_at).toBe('2026-12-21T14:50:00');
    expect(staging.vehicle_reg).toBe('AB12CDE');
    expect(staging.customer_email).toBe('test.customer@example.com');
    expect(staging.customer_phone).toBe('07700900123');
    expect(staging.customer_name).toMatch(/Testperson/i);
    expect(staging.flight_number).toBe('TOM6171');
    expect(staging.vehicle_colour).toBe('Red');
    expect(staging.total_price).toBe(100.99);
    expect(staging.raw_json.missing_required).toEqual([]);
  });
});
