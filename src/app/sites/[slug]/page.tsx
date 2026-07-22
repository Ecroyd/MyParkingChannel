import { getSiteContext } from "@/lib/site";
import { Header, Footer } from "./_components/SiteChrome";
import BookingHero from "@/components/booking/BookingHero";
import type { Metadata } from "next";
import { generateTenantPageMetadata, getTenantPageRenderData } from "@/lib/seo/page-render";
import { buildHomepageModel } from "@/lib/seo/homepage-model";
import { tenantThemeStyle } from "@/lib/theme/brand-color";
import {
  TrustStrip,
  HowItWorksSection,
  BenefitsSection,
  LocationSection,
  ReviewsSection,
  FaqPreviewSection,
  FinalCtaSection,
} from "@/components/site/home/HomeSections";
import { buildFaqPageJsonLd } from "@/lib/seo/json-ld";
import type { SitePageRow } from "@/lib/seo/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getProfile(slug: string) {
  const ctx = await getSiteContext(slug);
  if (!ctx) return null;

  const { createServerClient } = await import("@/lib/supabase/server");
  const supabase = await createServerClient();

  const { data: profile, error: profileError } = await supabase
    .from("tenant_public_profile")
    .select("*")
    .eq("tenant_id", ctx.tenant.id)
    .maybeSingle();

  if (profileError) {
    console.error("Error loading tenant profile:", profileError);
  }

  return { tenant: ctx.tenant, profile, branding: ctx.branding, site: ctx.site ?? null };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  const resolvedSearch = await searchParams;
  return generateTenantPageMetadata({
    slug: resolvedParams.slug,
    path: "/",
    pageKey: "home",
    searchParams: resolvedSearch,
  });
}

function navFromPages(pages: SitePageRow[]) {
  const fromConfig = pages
    .filter((p) => p.show_in_navigation && p.status === "published" && p.nav_label)
    .sort((a, b) => (a.nav_order ?? 100) - (b.nav_order ?? 100))
    .map((p) => {
      const path = p.path === "/" ? "/" : p.path;
      const label = String(p.nav_label);
      // Prefer concise public labels for common system pages
      if (p.page_key === "home" || path === "/") return { href: "/", label: label === "Home" || label === "Parking" ? "Home" : label };
      if (p.page_key === "book" || path === "/book") return { href: "/#booking", label: "Book" };
      if (p.page_key === "faq" || path === "/faq") return { href: "/faq", label: label.includes("FAQ") ? "FAQ" : label };
      return { href: path, label };
    });

  if (fromConfig.length) return fromConfig;

  return [
    { href: "/", label: "Home" },
    { href: "/#booking", label: "Book" },
    { href: "/directions", label: "Directions" },
    { href: "/faq", label: "FAQ" },
    { href: "/contact", label: "Contact" },
    { href: "/manage-booking", label: "Manage Booking" },
  ];
}

export default async function TenantHome({
  params,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const resolvedParams = await params;
  const data = await getProfile(resolvedParams.slug);
  const seo = await getTenantPageRenderData({
    slug: resolvedParams.slug,
    path: "/",
    pageKey: "home",
  });

  if (!data) {
    return (
      <main className="mx-auto max-w-xl px-4 py-24">
        <h1 className="text-2xl font-semibold">Site unavailable</h1>
        <p className="mt-2 text-slate-600">This tenant site is not published.</p>
      </main>
    );
  }

  const { tenant, profile, branding, site } = data;
  const p = profile as Record<string, unknown> | null;
  const title =
    (p?.business_name as string) ||
    branding?.app_name ||
    tenant.name ||
    "Airport Parking";
  const logoUrl =
    (seo?.bundle.settings?.logo_url as string | undefined) ||
    (p?.logo_url as string | undefined) ||
    tenant.brand_logo_url ||
    null;

  const home = buildHomepageModel({
    page: seo?.page ?? null,
    settings: seo?.bundle.settings ?? null,
    profile: p,
    tenantHeroTitle: tenant.site_hero_title,
    tenantHeroSubtitle: tenant.site_hero_subtitle,
  });

  const theme = tenantThemeStyle({
    primary: tenant.brand_primary,
    secondary: tenant.brand_secondary,
  });

  const navItems = navFromPages(seo?.bundle.pages ?? []);

  const addressObj = p?.address;
  const addressLines: string[] = [];
  if (addressObj && typeof addressObj === "object") {
    const a = addressObj as Record<string, string>;
    if (a.street || a.streetAddress) addressLines.push(String(a.street || a.streetAddress));
    const cityLine = [a.city || a.addressLocality, a.postalCode].filter(Boolean).join(" ");
    if (cityLine) addressLines.push(cityLine);
  }

  const hoursText = Array.isArray(p?.hours) && p!.hours!.length
    ? (p!.hours as Array<{ day?: string; open?: string; close?: string }>)
        .filter((h) => h.day && h.open && h.close)
        .slice(0, 1)
        .map((h) => `${h.day}: ${h.open}–${h.close}`)
        .join("")
    : null;

  const faqLd =
    home.sections.faq && home.faqs.length
      ? buildFaqPageJsonLd(home.faqs)
      : null;

  const jsonLdScripts = [
    ...(seo?.jsonLdScripts ?? []).filter((s) => !s.includes('"FAQPage"')),
    ...(faqLd ? [JSON.stringify(faqLd).replace(/</g, "\\u003c")] : []),
  ];

  const externalReview =
    Array.isArray(p?.external_review_links) && p!.external_review_links[0]
      ? typeof (p!.external_review_links as unknown[])[0] === "string"
        ? String((p!.external_review_links as unknown[])[0])
        : ((p!.external_review_links as Array<{ url?: string }>)[0]?.url ?? null)
      : null;

  return (
    <div style={theme} className="flex min-h-screen flex-col">
      {jsonLdScripts.map((script, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: script }}
        />
      ))}

      <Header title={title} logoUrl={logoUrl} navItems={navItems} />

      <BookingHero
        slug={resolvedParams.slug}
        tenantId={tenant.id}
        site={site}
        businessName={title}
        heading={home.h1}
        tagline={home.subtitle}
        eyebrow={home.eyebrow}
        trustPoints={home.trustPoints}
        heroImageUrl={home.heroImageUrl}
        heroImageAlt={home.heroImageAlt}
      />

      {home.sections.trustStrip ? <TrustStrip points={home.trustPoints} /> : null}

      {home.sections.howItWorks && home.howItWorks ? (
        <HowItWorksSection
          heading={home.howItWorks.heading}
          steps={home.howItWorks.steps ?? []}
          mapImageUrl={
            home.locationBlock?.imageUrl || home.heroImageUrl || null
          }
          mapImageAlt={
            home.locationBlock?.imageAlt ||
            home.heroImageAlt ||
            "Map showing car park location"
          }
        />
      ) : null}

      {home.sections.benefits && home.benefits?.items?.length ? (
        <BenefitsSection
          heading={home.benefits.heading}
          items={home.benefits.items}
        />
      ) : null}

      {home.sections.location ? (
        <LocationSection
          heading={home.locationBlock?.heading}
          body={home.locationBlock?.body}
          businessName={title}
          address={p?.address}
          phone={(p?.phone as string) || branding?.contact_phone}
          email={(p?.email as string) || branding?.contact_email}
          airports={p?.airports as string[] | null}
          what3words={p?.what3words as string | null}
          latitude={(p?.latitude as string | number | null) ?? null}
          longitude={(p?.longitude as string | number | null) ?? null}
        />
      ) : null}

      {home.sections.reviews && home.reviews ? (
        <ReviewsSection
          heading={home.reviews.heading}
          items={home.reviews.items ?? []}
          externalUrl={externalReview}
        />
      ) : null}

      {home.sections.faq && home.faqs.length ? (
        <FaqPreviewSection
          heading="Frequently asked questions"
          faqs={home.faqs}
        />
      ) : null}

      {home.sections.finalCta ? (
        <FinalCtaSection
          heading={home.finalCta?.heading}
          body={home.finalCta?.body}
          ctaText={home.finalCta?.ctaText}
          ctaHref={home.finalCta?.ctaHref || "/#booking"}
        />
      ) : null}

      <Footer
        title={title}
        logoUrl={logoUrl}
        description={home.footerDescription}
        phone={(p?.phone as string) || branding?.contact_phone}
        email={(p?.email as string) || branding?.contact_email}
        addressLines={addressLines}
        hoursText={hoursText}
        navItems={navItems}
      />
    </div>
  );
}
