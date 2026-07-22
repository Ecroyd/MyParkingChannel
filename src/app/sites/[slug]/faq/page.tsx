import { getSiteContext } from "@/lib/site";
import { Header, Footer, PageShell } from "../_components/SiteChrome";
import FAQAccordion from "@/components/site/FAQAccordion";
import type { Metadata } from "next";
import { generateTenantPageMetadata, getTenantPageRenderData } from "@/lib/seo/page-render";
import { faqItemsWithAnswers, parseContentBlocks } from "@/lib/seo/content-blocks";
import { SiteContentBlocks } from "@/components/site/SiteContentBlocks";
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
    path: "/faq",
    pageKey: "faq",
  });
}

export default async function FAQPage({ params }: PageProps) {
  const resolvedParams = await params;
  const data = await getProfile(resolvedParams.slug);
  const seo = await getTenantPageRenderData({
    slug: resolvedParams.slug,
    path: "/faq",
    pageKey: "faq",
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
  const h1 = seo?.page?.h1 || "Frequently asked questions";

  const blocks = parseContentBlocks(seo?.page?.content_json);
  const faqs = faqItemsWithAnswers(blocks, p?.faq);

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
          "Answers to common questions about booking and visiting."
        }
      >
        <div className="grid gap-12 lg:grid-cols-[1fr_240px]">
          <div className="space-y-10">
            {faqs.length > 0 ? (
              <FAQAccordion faqs={faqs} />
            ) : (
              <p className="text-slate-500">FAQ answers will appear here once published.</p>
            )}
            <SiteContentBlocks
              contentJson={blocks.filter((b) => b.type !== "faq")}
              profile={p}
            />
          </div>

          <aside className="space-y-6 lg:border-l lg:border-slate-200 lg:pl-8">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                Still need help?
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Contact us if you cannot find your answer.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                {(p?.phone || branding?.contact_phone) && (
                  <a
                    href={`tel:${p?.phone || branding?.contact_phone}`}
                    className="text-sm font-medium text-slate-900 hover:underline"
                  >
                    {p?.phone || branding?.contact_phone}
                  </a>
                )}
                {(p?.email || branding?.contact_email) && (
                  <a
                    href={`mailto:${p?.email || branding?.contact_email}`}
                    className="tenant-link text-sm"
                  >
                    {p?.email || branding?.contact_email}
                  </a>
                )}
                <Link href="/contact" className="tenant-link text-sm">
                  Contact page
                </Link>
              </div>
            </div>

            {Array.isArray(p?.hours) && p.hours.length > 0 ? (
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Opening hours
                </h2>
                <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
                  {p.hours.map(
                    (
                      hour: { day?: string; open?: string; close?: string },
                      index: number
                    ) => (
                      <li key={index} className="flex justify-between gap-3">
                        <span>{hour.day}</span>
                        <span>
                          {hour.open} – {hour.close}
                        </span>
                      </li>
                    )
                  )}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      </PageShell>
      <Footer title={title} />
    </>
  );
}
