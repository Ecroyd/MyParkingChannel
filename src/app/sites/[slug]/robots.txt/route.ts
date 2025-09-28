import { NextRequest, NextResponse } from "next/server";
import { getSiteContext } from "@/lib/site";

export async function GET(
  _: NextRequest, 
  { params }: { params: Promise<{ slug: string }> }
) {
  const resolvedParams = await params;
  const ctx = await getSiteContext(resolvedParams.slug);
  
  if (!ctx) {
    return new NextResponse("Site not found", { status: 404 });
  }

  const base = `https://myparkingchannel.app/sites/${resolvedParams.slug}`;
  
  const body = `User-agent: *
Allow: /

# Block admin and API routes
Disallow: /admin/
Disallow: /api/
Disallow: /_next/
Disallow: /widget/

# Sitemap
Sitemap: ${base}/sitemap.xml
`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=3600, s-maxage=3600"
    }
  });
}
