import { describe, it, expect, vi, beforeEach } from "vitest";

const parseEmailFileMock = vi.fn(async (..._args: unknown[]) => undefined);
const promoteMock = vi.fn(async (..._args: unknown[]) => ({ ok: true, bookingId: "booking-pv-1" }));
const markIngestFailureMock = vi.fn(async (..._args: unknown[]) => undefined);
const markIngestSuccessMock = vi.fn(async (..._args: unknown[]) => undefined);

vi.mock("@/lib/ingest/parseEmailFile", () => ({
  parseEmailFile: (...args: unknown[]) => parseEmailFileMock(...args),
}));
vi.mock("@/lib/ingest/promoteStagingToBooking", () => ({
  promoteStagingRowToBooking: (...args: unknown[]) => promoteMock(...args),
}));
vi.mock("@/lib/ingest/markIngestFailure", () => ({
  markIngestFailure: (...args: unknown[]) => markIngestFailureMock(...args),
  markIngestSuccess: (...args: unknown[]) => markIngestSuccessMock(...args),
  clearIngestEmailForReprocess: vi.fn(),
}));

import { processIngestEmail } from "@/lib/ingest/processIngestEmail";

const TENANT = "tenant-aaaa";

type Inserted = { table: string; row: Record<string, unknown> };

function mockSupabase() {
  const inserted: Inserted[] = [];
  const upserts: Inserted[] = [];
  let nextId = 1;

  function builder(table: string): any {
    let lastInsert: Record<string, unknown> | null = null;
    const result = () => {
      if (table === "tenant_inbound_inboxes") return { data: { tenant_id: TENANT }, error: null };
      if (lastInsert) return { data: { id: `file-${nextId++}` }, error: null };
      return { data: null, error: null };
    };
    const b: any = {
      select: () => b,
      eq: () => b,
      in: () => b,
      update: () => b,
      insert: (row: Record<string, unknown>) => {
        inserted.push({ table, row });
        lastInsert = row;
        return b;
      },
      upsert: (row: Record<string, unknown>) => {
        upserts.push({ table, row });
        return b;
      },
      single: async () => result(),
      maybeSingle: async () => result(),
      then: (ok: any, err: any) => Promise.resolve({ data: null, error: null }).then(ok, err),
    };
    return b;
  }

  const supabase = {
    from: (table: string) => builder(table),
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  };
  return { supabase: supabase as never, inserted, upserts };
}

function mime(opts: { subject: string; from: string; body: string; attachments: { filename: string; type: string; disposition: "inline" | "attachment"; data: string }[] }) {
  const boundary = "BOUNDARY123";
  const parts = [
    `--${boundary}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${opts.body}\r\n`,
    ...opts.attachments.map(
      (a) =>
        `--${boundary}\r\nContent-Type: ${a.type}; name="${a.filename}"\r\nContent-Disposition: ${a.disposition}; filename="${a.filename}"\r\nContent-ID: <${a.filename}>\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(a.data).toString("base64")}\r\n`
    ),
    `--${boundary}--\r\n`,
  ];
  const raw = [
    `From: ${opts.from}`,
    `To: bookings@tenant.example`,
    `Subject: ${opts.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    parts.join(""),
  ].join("\r\n");
  return Buffer.from(raw).toString("base64");
}

const APH_ROW = `"0  ","NEW    ","NCY3S  ","                   ","30/09/26","Mr  ","M","GM14WSY   ","VOLVO     ","GREY      "," 1","19:45","       ","0000061.04","       ","03/10/26","15:00","       "," "," ","    ","Wheeler             ","27/09/26","00:00","                                                            "," ","TE","","","    ","    ","","07973433237"`;

beforeEach(() => {
  parseEmailFileMock.mockClear();
  promoteMock.mockClear();
  markIngestFailureMock.mockClear();
  markIngestSuccessMock.mockClear();
});

describe("processIngestEmail — inline signature images", () => {
  it("still runs the APH body-CSV fallback when the only attachment is an inline image", async () => {
    const { supabase, inserted } = mockSupabase();
    const raw = mime({
      subject: "Fwd: APH bookings",
      from: "ops@tenant.example",
      body: ["Please see below", "", APH_ROW, "", "Thanks", "Ops"].join("\n"),
      attachments: [{ filename: "image001.png", type: "image/png", disposition: "inline", data: "PNGDATA" }],
    });

    const result = await processIngestEmail(supabase, {
      emailId: "email-1",
      raw_rfc822_base64: raw,
      to_address: "bookings@tenant.example",
      from_address: "ops@tenant.example",
      subject: "Fwd: APH bookings",
    });

    expect(result.ok).toBe(true);
    const files = inserted.filter((i) => i.table === "ingest_email_files").map((i) => i.row.filename);
    expect(files).toContain("image001.png");
    expect(files).toContain("aph-forwarded.csv");
    expect(parseEmailFileMock).toHaveBeenCalled();
  });

  it("raises the not-recognised alert when a booking email only has a signature image", async () => {
    const { supabase } = mockSupabase();
    const raw = mime({
      subject: "New booking notification",
      from: "unknown-supplier@example.com",
      body: "Hello, a booking was made. Our template changed so nothing here is parseable. ".repeat(2),
      attachments: [{ filename: "image001.png", type: "image/png", disposition: "inline", data: "PNGDATA" }],
    });

    const result = await processIngestEmail(supabase, {
      emailId: "email-2",
      raw_rfc822_base64: raw,
      to_address: "bookings@tenant.example",
      from_address: "unknown-supplier@example.com",
      subject: "New booking notification",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not recognised/);
    expect(markIngestFailureMock).toHaveBeenCalled();
  });
});

describe("processIngestEmail — ParkVia body with a PDF attached", () => {
  const PARKVIA_BODY = [
    "ParkVia - New Booking Notification",
    "Booking Ref: PV12345678",
    "Selected Car Park: Test Meet & Greet",
    "Total Price: £1,045.50",
    "Amount Paid: £1,045.50",
    "Vehicle Drop-Off Date: 26/10/2026 1:30 PM",
    "Vehicle Pick-Up Date: 02/11/2026 09:00",
    "Name: José Müller",
    "Mobile: 07700900123",
    "Email: jose@example.com",
    "Registration Number: AB12 CDE",
    "Kind regards",
  ].join("\n");

  it("parses the body booking even though a PDF is attached", async () => {
    const { supabase, upserts } = mockSupabase();
    const raw = mime({
      subject: "ParkVia - Notification",
      from: "noreply@parkvia.com",
      body: PARKVIA_BODY,
      attachments: [{ filename: "invoice.pdf", type: "application/pdf", disposition: "attachment", data: "%PDF-1.4" }],
    });

    const result = await processIngestEmail(supabase, {
      emailId: "email-3",
      raw_rfc822_base64: raw,
      to_address: "bookings@tenant.example",
      from_address: "noreply@parkvia.com",
      subject: "ParkVia - Notification",
    });

    expect(result.ok).toBe(true);
    expect(result.textPromoted).toBe(true);
    expect(result.bookingId).toBe("booking-pv-1");
    const staging = upserts.find((u) => u.table === "booking_import_staging")!.row;
    // Same dedupe key shape parseEmailFile uses (makeStagingDedupeKey) → no second booking.
    expect(staging.dedupe_key).toBe(`${TENANT}|ref|PV12345678`);
    expect(staging.start_at).toBe("2026-10-26T13:30:00");
    expect(staging.total_price).toBe(1045.5);
    expect(staging.customer_name).toBe("José Müller");
    // Attachment is still stored and parsed, but its failure can't mark the email failed.
    expect(parseEmailFileMock).toHaveBeenCalled();
  });
});
