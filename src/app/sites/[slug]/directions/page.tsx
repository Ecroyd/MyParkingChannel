import { getSiteContext } from "@/lib/site";
import { Header, Footer, PageShell } from "../_components/SiteChrome";
import type { Metadata } from "next";
import { generateTenantPageMetadata, getTenantPageRenderData } from "@/lib/seo/page-render";
import { SiteContentBlocks } from "@/components/site/SiteContentBlocks";
import { parseContentBlocks } from "@/lib/seo/content-blocks";
import {
  formatAddressLines,
  formatAddressSingleLine,
  mapsQueryFromProfile,
} from "@/lib/seo/public-address";
import Link from "next/link";

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getProfile(slug: string) {
  const ctx = await getSiteContext(slug);
  if (!ctx) return null;

  const { getServerSupabase } = await import("@/lib/supabase/server");
  const supabase = await getServerSupabase();

  const { data: profile } = await supabase
    .from("tenant_public_profile")
    .select("*")
    .eq("tenant_id", ctx.tenant.id)
    .maybeSingle();

  return { tenant: ctx.tenant, profile, branding: ctx.branding };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  return generateTenantPageMetadata({
    slug: resolvedParams.slug,
    path: "/directions",
    pageKey: "directions",
  });
}

export default async function DirectionsPage({ params }: PageProps) {
  const resolvedParams = await params;
  const data = await getProfile(resolvedParams.slug);
  const seo = await getTenantPageRenderData({
    slug: resolvedParams.slug,
    path: "/directions",
    pageKey: "directions",
  });

  if (!data) {
    return (
      <main className="mx-auto max-w-xl px-4 py-24">
        <h1 className="text-2xl font-semibold">Site unavailable</h1>
        <p className="mt-2 text-slate-600">This tenant site is not published.</p>
      </main>
    );
  }

  const { tenant, profile, branding } = data;
  const p = profile as Record<string, unknown> | null;
  const title =
    (p?.business_name as string) ?? branding?.app_name ?? tenant.name ?? "Airport Parking";
  const h1 = seo?.page?.h1 || "Directions";

  const addressLines = formatAddressLines({
    address: p?.address as never,
    county: p?.county as string | null,
    country: p?.country as string | null,
    branding,
  });
  const fullAddress = formatAddressSingleLine({
    address: p?.address as never,
    county: p?.county as string | null,
    country: p?.country as string | null,
    branding,
  });

  const latitude = (p?.latitude as string | number | null) ?? null;
  const longitude = (p?.longitude as string | number | null) ?? null;
  const what3words = typeof p?.what3words === "string" ? p.what3words.trim() : "";
  const phone = ((p?.phone as string) || branding?.contact_phone || "").trim();
  const email = ((p?.email as string) || branding?.contact_email || "").trim();
  const airports = Array.isArray(p?.airports) ? (p!.airports as string[]) : [];

  const blocks = parseContentBlocks(seo?.page?.content_json);
  const directionsBlock = blocks.find((b) => b.type === "directions");
  const homeSeo = await getTenantPageRenderData({
    slug: resolvedParams.slug,
    path: "/",
    pageKey: "home",
  });
  const homeDirections = parseContentBlocks(homeSeo?.page?.content_json).find(
    (b) => b.type === "directions"
  );

  const directionsBody =
    (directionsBlock && "body" in directionsBlock ? directionsBlock.body : null) ||
    (homeDirections && "body" in homeDirections ? homeDirections.body : null) ||
    null;
  const directionsHeading =
    (directionsBlock && "heading" in directionsBlock ? directionsBlock.heading : null) ||
    "Arrival directions";

  const mapImageUrl =
    (directionsBlock && "imageUrl" in directionsBlock
      ? (directionsBlock as { imageUrl?: string }).imageUrl
      : null) ||
    (homeDirections && "imageUrl" in homeDirections
      ? (homeDirections as { imageUrl?: string }).imageUrl
      : null) ||
    null;
  const mapImageAlt =
    (directionsBlock && "imageAlt" in directionsBlock
      ? (directionsBlock as { imageAlt?: string }).imageAlt
      : null) ||
    (homeDirections && "imageAlt" in homeDirections
      ? (homeDirections as { imageAlt?: string }).imageAlt
      : null) ||
    "Map showing car park location";

  const mapsQ = mapsQueryFromProfile({
    latitude,
    longitude,
    addressLine: fullAddress,
  });

  // Terminal transfer: only show if explicitly present in approved directions body.
  // Do not invent shuttle / walking-time claims.

  return (
    <>
      {seo?.jsonLdScripts?.map((script, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: script }}
        />
      ))}
      <Header title={title} logoUrl={(p?.logo_url as string) || null} tenantSlug={resolvedParams.slug} />
      <PageShell
        title={h1}
        subtitle={
          seo?.page?.excerpt ||
          "Find your way using the address and map below."
        }
      >
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="space-y-8">
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                Address
              </h2>
              {addressLines.length ? (
                <div className="mt-3 space-y-3">
                  <p className="text-base leading-relaxed text-slate-800">
                    {addressLines.join(", ")}
                  </p>
                  {what3words ? (
                    <p className="text-sm text-slate-500">
                      What3Words:{" "}
                      <a
                        href={`https://what3words.com/${what3words.replace(/^\/\/\//, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tenant-link font-mono"
                      >
                        {what3words}
                      </a>
                    </p>
                  ) : null}
                  {airports[0] ? (
                    <p className="text-sm text-slate-600">
                      Airport served:{" "}
                      <span className="font-medium text-slate-900">{airports[0]}</span>
                    </p>
                  ) : null}
                  {mapsQ ? (
                    <a
                      href={`https://maps.google.com/maps?q=${encodeURIComponent(mapsQ)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tenant-link inline-block text-sm font-medium"
                    >
                      Open in Google Maps
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="mt-3 text-slate-500">
                  Full address details will appear here once published.
                  {what3words || mapsQ ? " Use What3Words or the map link below in the meantime." : null}
                </p>
              )}
              {!addressLines.length && what3words ? (
                <p className="mt-3 text-sm text-slate-600">
                  What3Words:{" "}
                  <a
                    href={`https://what3words.com/${what3words.replace(/^\/\/\//, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tenant-link font-mono"
                  >
                    {what3words}
                  </a>
                </p>
              ) : null}
              {!addressLines.length && mapsQ ? (
                <a
                  href={`https://maps.google.com/maps?q=${encodeURIComponent(mapsQ)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tenant-link mt-3 inline-block text-sm font-medium"
                >
                  Open in Google Maps
                </a>
              ) : null}
            </section>

            {directionsBody ? (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                  {directionsHeading}
                </h2>
                <div className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-slate-700">
                  {directionsBody}
                </div>
              </section>
            ) : null}

            {(phone || email) && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Need help?
                </h2>
                <div className="mt-3 space-y-2 text-sm">
                  {phone ? (
                    <p>
                      <a href={`tel:${phone}`} className="tenant-link">
                        {phone}
                      </a>
                    </p>
                  ) : null}
                  {email ? (
                    <p>
                      <a href={`mailto:${email}`} className="tenant-link">
                        {email}
                      </a>
                    </p>
                  ) : null}
                  <Link href="/contact" className="tenant-link inline-block">
                    Contact page
                  </Link>
                </div>
              </section>
            )}
          </div>

          <div>
            {mapImageUrl ? (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mapImageUrl}
                  alt={mapImageAlt || "Location map"}
                  width={900}
                  height={700}
                  className="aspect-[4/3] w-full object-cover"
                />
              </div>
            ) : mapsQ ? (
              <div
                className="flex min-h-[280px] flex-col justify-between rounded-xl p-8 text-white"
                style={{
                  background:
                    "linear-gradient(145deg, color-mix(in srgb, var(--tenant-primary, #1e40af) 92%, #0f172a), #0f172a 70%)",
                }}
              >
                <div>
                  <p className="text-2xl font-semibold tracking-tight">Find us on the map</p>
                  <p className="mt-3 text-[15px] leading-relaxed text-white/80">
                    Open Google Maps for the pin and turn-by-turn directions.
                  </p>
                </div>
                <a
                  href={`https://maps.google.com/maps?q=${encodeURIComponent(mapsQ)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-8 inline-flex h-12 items-center justify-center rounded-lg bg-white px-5 text-[15px] font-semibold text-slate-900"
                >
                  Open Google Maps
                </a>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-sm text-slate-600">
                A location map will appear here once coordinates or a map image are published
                for this site.
              </div>
            )}
          </div>
        </div>

        <SiteContentBlocks
          contentJson={blocks.filter((b) => b.type !== "directions")}
          profile={p as never}
        />
      </PageShell>
      <Footer title={title} />
    </>
  );
}
