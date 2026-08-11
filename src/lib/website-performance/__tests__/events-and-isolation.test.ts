import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  FUNNEL_EVENT_NAMES,
  SERVER_ONLY_EVENTS,
  isFunnelEventName,
} from "../events";
import { allowFirstPartyClientAnalytics, allowThirdPartyTags } from "../consent";

describe("funnel event definitions", () => {
  it("includes all required funnel stages", () => {
    expect(FUNNEL_EVENT_NAMES).toEqual([
      "website_session",
      "availability_search",
      "availability_result",
      "booking_started",
      "customer_details_started",
      "checkout_started",
      "payment_started",
      "booking_completed",
      "booking_failed",
    ]);
  });

  it("marks completion/failure/checkout as server-only", () => {
    expect(SERVER_ONLY_EVENTS.has("booking_completed")).toBe(true);
    expect(SERVER_ONLY_EVENTS.has("booking_failed")).toBe(true);
    expect(SERVER_ONLY_EVENTS.has("checkout_started")).toBe(true);
    expect(SERVER_ONLY_EVENTS.has("payment_started")).toBe(true);
    expect(SERVER_ONLY_EVENTS.has("website_session")).toBe(false);
  });

  it("validates event names", () => {
    expect(isFunnelEventName("booking_completed")).toBe(true);
    expect(isFunnelEventName("click_button")).toBe(false);
  });
});

describe("consent", () => {
  it("allows first-party in basic/off; requires consent in strict", () => {
    expect(allowFirstPartyClientAnalytics("basic", false)).toBe(true);
    expect(allowFirstPartyClientAnalytics("off", false)).toBe(true);
    expect(allowFirstPartyClientAnalytics("strict", false)).toBe(false);
    expect(allowFirstPartyClientAnalytics("strict", true)).toBe(true);
  });

  it("gates third-party tags", () => {
    expect(allowThirdPartyTags("off", true)).toBe(false);
    expect(allowThirdPartyTags("basic", false)).toBe(true);
    expect(allowThirdPartyTags("strict", false)).toBe(false);
    expect(allowThirdPartyTags("strict", true)).toBe(true);
  });
});

describe("recordConversionEvent guards", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("rejects client spoofing of booking_completed", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: () => ({
          insert: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    }));
    const { recordConversionEvent } = await import("../recordEvent");
    const result = await recordConversionEvent({
      tenantId: "tenant-a",
      eventName: "booking_completed",
      anonymousId: "anon",
      sessionId: "sess",
      dedupeKey: "x",
      serverTrusted: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("allows server-trusted booking_completed", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: () => ({ insert }),
      }),
    }));
    const { recordConversionEvent } = await import("../recordEvent");
    const result = await recordConversionEvent({
      tenantId: "tenant-a",
      eventName: "booking_completed",
      anonymousId: "anon",
      sessionId: "sess",
      dedupeKey: "booking_completed:tenant-a:pi_1",
      bookingReference: "ABC123",
      bookingValueCents: 5000,
      serverTrusted: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.inserted).toBe(true);
    expect(insert).toHaveBeenCalled();
    const row = insert.mock.calls[0][0];
    expect(row.tenant_id).toBe("tenant-a");
    expect(row.meta).not.toHaveProperty("customer_email");
  });

  it("treats unique conflicts as idempotent success (no duplicate)", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: () => ({
          insert: vi.fn().mockResolvedValue({ error: { code: "23505", message: "duplicate" } }),
        }),
      }),
    }));
    const { recordConversionEvent } = await import("../recordEvent");
    const result = await recordConversionEvent({
      tenantId: "tenant-a",
      eventName: "website_session",
      anonymousId: "anon",
      sessionId: "sess",
      dedupeKey: "sess:website_session",
      serverTrusted: false,
    });
    expect(result).toEqual({ ok: true, inserted: false });
  });

  it("never throws when analytics insert fails (booking safety)", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => {
        throw new Error("supabase down");
      },
    }));
    const { recordConversionEvent, recordConversionEventSafe } = await import(
      "../recordEvent"
    );
    const result = await recordConversionEvent({
      tenantId: "tenant-a",
      eventName: "website_session",
      anonymousId: "anon",
      sessionId: "sess",
      dedupeKey: "k",
    });
    expect(result.ok).toBe(false);
    expect(() =>
      recordConversionEventSafe({
        tenantId: "tenant-a",
        eventName: "website_session",
        anonymousId: "anon",
        sessionId: "sess",
        dedupeKey: "k2",
      })
    ).not.toThrow();
  });
});

describe("tenant isolation helpers", () => {
  it("resolveTenantForPublicAnalytics ignores client tenant_id and uses slug lookup", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "resolved-tenant", slug: "acme-parking" },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: () => ({ select }),
      }),
    }));
    const { resolveTenantForPublicAnalytics } = await import(
      "../resolveTenantForPublic"
    );
    const resolved = await resolveTenantForPublicAnalytics({
      host: "localhost:3002",
      tenantSlug: "acme-parking",
    });
    expect(resolved).toEqual({
      tenantId: "resolved-tenant",
      tenantSlug: "acme-parking",
    });
    // Ensure we queried by slug, not a forged uuid
    expect(eq).toHaveBeenCalledWith("slug", "acme-parking");
  });
});
