import { getSiteContext } from "@/lib/site";
import { Header, Footer, PageShell } from "../_components/SiteChrome";
import LocationMap from "@/components/maps/LocationMap";
import type { Metadata } from "next";
import { generateTenantPageMetadata, getTenantPageRenderData } from "@/lib/seo/page-render";
import { SiteContentBlocks } from "@/components/site/SiteContentBlocks";
import { parseContentBlocks } from "@/lib/seo/content-blocks";

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
  const p = profile;
  const title = p?.business_name ?? branding?.app_name ?? tenant.name ?? "Airport Parking";
  const h1 = seo?.page?.h1 || "Directions";

  const address = p?.address || {
    street: branding?.contact_address,
    city: branding?.contact_city,
    postalCode: branding?.contact_postcode,
    country: p?.country || branding?.contact_country || undefined,
  };

  const fullAddress = [
    address?.street || address?.streetAddress,
    address?.city || address?.addressLocality,
    p?.county || address?.county,
    address?.postalCode,
    address?.country || address?.addressCountry || p?.country,
  ]
    .filter(Boolean)
    .join(", ");

  const latitude = p?.latitude ?? p?.geo?.lat ?? null;
  const longitude = p?.longitude ?? p?.geo?.lng ?? null;

  const directionsBlock = parseContentBlocks(seo?.page?.content_json).find(
    (b) => b.type === "directions"
  );

  return (
    <>
      {seo?.jsonLdScripts?.map((script, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: script }}
        />
      ))}
      <Header title={title} logoUrl={p?.logo_url} tenantSlug={resolvedParams.slug} />
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
              {fullAddress ? (
                <div className="mt-3 space-y-3">
                  <p className="text-base text-slate-800">{fullAddress}</p>
                  {p?.what3words ? (
                    <p className="text-sm text-slate-500">
                      What3Words:{" "}
                      <a
                        href={`https://what3words.com/${String(p.what3words).replace(/^\/\/\//, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tenant-link font-mono"
                      >
                        {p.what3words}
                      </a>
                    </p>
                  ) : null}
                  <a
                    href={`https://maps.google.com/maps?q=${encodeURIComponent(
                      latitude && longitude ? `${latitude},${longitude}` : fullAddress
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tenant-link inline-block text-sm"
                  >
                    Open in Google Maps
                  </a>
                </div>
              ) : (
                <p className="mt-3 text-slate-500">Address information coming soon.</p>
              )}
            </section>

            {directionsBlock?.body ? (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                  {directionsBlock.heading || "Driving directions"}
                </h2>
                <div className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-slate-700">
                  {directionsBlock.body}
                </div>
              </section>
            ) : null}

            {Array.isArray(p?.hours) && p.hours.length > 0 ? (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Opening hours
                </h2>
                <ul className="mt-3 space-y-1.5 text-sm text-slate-800">
                  {p.hours.map(
                    (
                      hour: { day?: string; open?: string; close?: string },
                      index: number
                    ) => (
                      <li key={index} className="flex max-w-xs justify-between gap-4">
                        <span>{hour.day}</span>
                        <span>
                          {hour.open} – {hour.close}
                        </span>
                      </li>
                    )
                  )}
                </ul>
              </section>
            ) : null}

            {(p?.phone || p?.email || branding?.contact_phone || branding?.contact_email) && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Need help?
                </h2>
                <div className="mt-3 space-y-2 text-sm">
                  {(p?.phone || branding?.contact_phone) && (
                    <p>
                      <a
                        href={`tel:${p?.phone || branding?.contact_phone}`}
                        className="tenant-link"
                      >
                        {p?.phone || branding?.contact_phone}
                      </a>
                    </p>
                  )}
                  {(p?.email || branding?.contact_email) && (
                    <p>
                      <a
                        href={`mailto:${p?.email || branding?.contact_email}`}
                        className="tenant-link"
                      >
                        {p?.email || branding?.contact_email}
                      </a>
                    </p>
                  )}
                </div>
              </section>
            )}
          </div>

          <div className="tenant-panel overflow-hidden p-2">
            <LocationMap
              className="h-80 w-full rounded-lg"
              lat={latitude}
              lng={longitude}
              zoom={15}
              title={p?.business_name || "Parking Location"}
              address={fullAddress}
            />
          </div>
        </div>

        <SiteContentBlocks
          contentJson={parseContentBlocks(seo?.page?.content_json).filter(
            (b) => b.type !== "directions"
          )}
          profile={p}
        />
      </PageShell>
      <Footer title={title} />
    </>
  );
}
