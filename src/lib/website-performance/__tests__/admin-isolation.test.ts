import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

describe("admin website performance API tenant isolation", () => {
  const routePath = path.resolve(
    __dirname,
    "../../../app/api/admin/website-performance/route.ts"
  );
  const src = readFileSync(routePath, "utf8");

  it("uses authenticated tenant context, not client tenant_id", () => {
    expect(src).toContain("getCurrentTenantContext");
    expect(src).toContain("canViewAnalytics");
    expect(src).toContain("ctx.tenantId");
    expect(src).toMatch(/Ignore any client tenant_id|never from the client/i);
  });

  it("queries aggregates with ctx.tenantId only", () => {
    expect(src).toContain("getFunnelSummaryForTenant(ctx.tenantId");
    expect(src).toContain("getMigrationComparison(\n        ctx.tenantId");
  });
});

describe("public ingest rejects server-only completion spoofing", () => {
  const routePath = path.resolve(
    __dirname,
    "../../../app/api/public/website-conversion/route.ts"
  );
  const src = readFileSync(routePath, "utf8");

  it("rejects tenant_id from body and server-only events", () => {
    expect(src).toContain("resolveTenantForPublicAnalytics");
    expect(src).toContain("SERVER_ONLY_EVENTS");
    expect(src).toContain("Event must be recorded server-side");
    expect(src).toMatch(/delete.*tenant_id|Ignore any client-supplied tenant_id/i);
  });
});

describe("webhook records authoritative booking_completed", () => {
  const routePath = path.resolve(
    __dirname,
    "../../../app/api/stripe/webhook/route.ts"
  );
  const src = readFileSync(routePath, "utf8");

  it("emits booking_completed only after successful insert", () => {
    expect(src).toContain("booking_completed");
    expect(src).toContain("serverTrusted: true");
    expect(src).toContain("booking_failed");
  });
});
