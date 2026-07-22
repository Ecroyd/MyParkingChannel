import { getSiteContext } from "@/lib/site";
import { Header, Footer, PageShell } from "../_components/SiteChrome";
import type { Metadata } from "next";
import { generateTenantPageMetadata, getTenantPageRenderData } from "@/lib/seo/page-render";
import { SiteContentBlocks } from "@/components/site/SiteContentBlocks";
import { formatAddressLines } from "@/lib/seo/public-address";
import { buildLocalBusinessJsonLd } from "@/lib/seo/json-ld";
import Link from "next/link";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  return generateTenantPageMetadata({
    slug: resolvedParams.slug,
    path: "/contact",
    pageKey: "contact",
  });
}

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const preview = resolvedSearchParams?.preview === "1";
  const ctx = await getSiteContext(resolvedParams.slug, { preview });
  const seo = await getTenantPageRenderData({
    slug: resolvedParams.slug,
    path: "/contact",
    pageKey: "contact",
  });

  if (!ctx) {
    return <main className="mx-auto max-w-xl px-4 py-24">Site unavailable</main>;
  }

  const profile = seo?.profile as Record<string, unknown> | null;
  const title =
    (profile?.business_name as string) ||
    ctx.branding?.app_name ||
    ctx.tenant.name ||
    "Airport Parking";
  const h1 = seo?.page?.h1 || "Contact us";

  const phone = ((profile?.phone as string) || ctx.branding?.contact_phone || "").trim();
  const email = ((profile?.email as string) || ctx.branding?.contact_email || "").trim();
  const addressLines = formatAddressLines({
    address: profile?.address as never,
    county: profile?.county as string | null,
    country: profile?.country as string | null,
    branding: ctx.branding,
  });
  const hours = Array.isArray(profile?.hours) ? profile!.hours : null;

  const localLd =
    seo?.pageUrl && profile
      ? buildLocalBusinessJsonLd({
          profile: profile as never,
          url: seo.pageUrl,
          schemaType: seo?.bundle.settings?.schema_business_type,
          logo: seo?.bundle.settings?.logo_url || (profile?.logo_url as string),
        })
      : null;

  return (
    <>
      {seo?.jsonLdScripts?.map((script, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: script }}
        />
      ))}
      {localLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(localLd).replace(/</g, "\\u003c"),
          }}
        />
      ) : null}
      <Header
        title={title}
        logoUrl={profile?.logo_url as string}
        tenantSlug={resolvedParams.slug}
      />
      <PageShell
        title={h1}
        subtitle={
          seo?.page?.excerpt ||
          "Questions about arrival or your booking? We're here to help."
        }
      >
        <dl className="grid gap-5 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-slate-500">Business</dt>
            <dd className="mt-1 font-medium text-slate-900">{title}</dd>
          </div>
          {email ? (
            <div>
              <dt className="text-slate-500">Email</dt>
              <dd className="mt-1">
                <a href={`mailto:${email}`} className="tenant-link font-medium">
                  {email}
                </a>
              </dd>
            </div>
          ) : null}
          {phone ? (
            <div>
              <dt className="text-slate-500">Phone</dt>
              <dd className="mt-1">
                <a href={`tel:${phone}`} className="tenant-link font-medium">
                  {phone}
                </a>
              </dd>
            </div>
          ) : null}
          {addressLines.length ? (
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Address</dt>
              <dd className="mt-1 text-slate-800">{addressLines.join(", ")}</dd>
            </div>
          ) : null}
          {hours && hours.length > 0 ? (
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Opening hours</dt>
              <dd className="mt-2 space-y-1 text-slate-800">
                {hours.map(
                  (h: { day?: string; open?: string; close?: string }, i: number) =>
                    h.day && h.open && h.close ? (
                      <div key={i} className="flex max-w-sm justify-between gap-4">
                        <span>{h.day}</span>
                        <span>
                          {h.open} – {h.close}
                        </span>
                      </div>
                    ) : null
                )}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-8">
          <Link href="/directions" className="tenant-link text-sm font-medium">
            Get directions
          </Link>
        </div>

        <SiteContentBlocks
          contentJson={seo?.page?.content_json}
          profile={profile as never}
          omitTypes={["contact"]}
        />
      </PageShell>
      <Footer title={title} />
    </>
  );
}
