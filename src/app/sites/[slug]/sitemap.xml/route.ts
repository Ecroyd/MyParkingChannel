import { NextRequest, NextResponse } from "next/server";
import {
  getSiteSeoBundleBySlug,
  buildSitemapXml,
  ensureSystemPages,
} from "@/lib/seo";

export async function GET(
  _: NextRequest,
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

  const xml = buildSitemapXml({
    pages: bundle.pages,
    settings: bundle.settings,
    domains: bundle.domains,
    sitePrimaryDomain: bundle.sitePrimaryDomain,
  });

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Site-Id": bundle.siteId,
    },
  });
}
