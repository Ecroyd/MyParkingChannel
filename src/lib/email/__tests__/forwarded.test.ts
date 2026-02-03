import { getParsableBodyForDirectBooking } from "../forwarded";

test("extracts forwarded region for FW Flyparks Payment Successful", () => {
  const subject = "FW: Flyparks Payment Successful";
  const text = `
Hi James,

---------- Forwarded message ----------
From: Flyparks <noreply@flyparks.com>
Date: Tue, 2 Feb 2026 at 10:01
Subject: Flyparks Payment Successful

Booking Reference: FP12345
Vehicle Registration: AB12CDE
Start: 2026-02-05 10:00
End: 2026-02-08 10:00

-- 
Sent from my iPhone
[image: image001.png]
  `.trim();

  const out = getParsableBodyForDirectBooking({ subject, text, html: null });
  expect(out).toContain("Booking Reference: FP12345");
  expect(out).toContain("Vehicle Registration: AB12CDE");
  expect(out).not.toContain("Sent from my iPhone");
  expect(out).not.toContain("image001.png");
});
