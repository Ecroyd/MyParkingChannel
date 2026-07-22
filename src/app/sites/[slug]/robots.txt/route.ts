import { NextRequest, NextResponse } from "next/server";
import {
  getSiteSeoBundleBySlug,
  buildRobotsTxt,
  ensureSystemPages,
} from "@/lib/seo";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  let bundle = await getSiteSeoBundleBySlug(slug);

  if (bundle?.siteId) {
    await ensureSystemPages(bundle.siteId);
    bundle = await getSiteSeoBundleBySlug(slug);
  }

  if (!bundle) {
    return new NextResponse("Site not found", { status: 404 });
  }

  const body = buildRobotsTxt({
    settings: bundle.settings,
    domains: bundle.domains,
    sitePrimaryDomain: bundle.sitePrimaryDomain,
    requestHost: req.headers.get("host"),
  });

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Site-Id": bundle.siteId,
    },
  });
}
