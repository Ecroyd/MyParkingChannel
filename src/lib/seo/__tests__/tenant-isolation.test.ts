import { describe, expect, it } from "vitest";
import { assertSiteBelongsToTenant } from "@/lib/seo/admin-context";
import type { SeoAdminContext } from "@/lib/seo/admin-context";

describe("Tenant A cannot edit Tenant B SEO", () => {
  const tenantA: SeoAdminContext = {
    userId: "user-a",
    role: "admin",
    tenantId: "tenant-a",
    tenantSlug: "flyparksexeter",
    tenantName: "Fly Parks Exeter",
    siteId: "site-a",
    siteSlug: "flyparksexeter",
    sitePrimaryDomain: "parkingexeterairport.co.uk",
  };

  it("rejects foreign site ids", () => {
    expect(assertSiteBelongsToTenant("site-a", tenantA)).toBe(true);
    expect(assertSiteBelongsToTenant("site-b", tenantA)).toBe(false);
  });
});
