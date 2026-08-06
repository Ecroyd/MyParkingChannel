import { NextRequest, NextResponse } from "next/server";
import { getSiteSeoBundleBySlug } from "@/lib/seo";
import { buildLlmsTxt } from "@/lib/seo/llms-txt";
import type { JsonLdProfile } from "@/lib/seo/json-ld";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const bundle = await getSiteSeoBundleBySlug(slug);

  if (!bundle) {
    return new NextResponse("# Site not found\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const { body, status } = buildLlmsTxt({
    settings: bundle.settings,
    profile: bundle.profile as JsonLdProfile | null,
    domains: bundle.domains,
    sitePrimaryDomain: bundle.sitePrimaryDomain,
  });

  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Site-Id": bundle.siteId,
    },
  });
}
