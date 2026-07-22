import type { Metadata } from "next";
import { Header, Footer, PageShell } from "../_components/SiteChrome";
import { generateTenantPageMetadata, getTenantPageRenderData } from "@/lib/seo/page-render";
import { SiteContentBlocks } from "@/components/site/SiteContentBlocks";
import { parseContentBlocks } from "@/lib/seo/content-blocks";

type LegalKind = "terms" | "privacy";

async function renderLegalPage(args: {
  slug: string;
  kind: LegalKind;
  fallbackH1: string;
  fallbackBody: string;
}) {
  const seo = await getTenantPageRenderData({
    slug: args.slug,
    path: `/${args.kind}`,
    pageKey: args.kind,
  });
  const profile = seo?.profile as Record<string, unknown> | null;
  const title =
    (profile?.business_name as string) ||
    seo?.bundle.settings?.website_name ||
    "Airport Parking";
  const h1 = seo?.page?.h1 || args.fallbackH1;
  const md = seo?.page?.content_md?.trim();
  const profileText =
    args.kind === "terms"
      ? (typeof profile?.terms_text === "string" ? profile.terms_text.trim() : "")
      : typeof profile?.privacy_text === "string"
        ? profile.privacy_text.trim()
        : "";

  return (
    <>
      {seo?.jsonLdScripts?.map((script, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: script }}
        />
      ))}
      <Header title={title} logoUrl={(profile?.logo_url as string) || null} />
      <PageShell title={h1} subtitle={seo?.page?.excerpt}>
        {md ? (
          <div className="prose prose-slate max-w-none whitespace-pre-wrap text-base leading-relaxed text-slate-700">
            {md}
          </div>
        ) : profileText ? (
          <div className="prose prose-slate max-w-none whitespace-pre-wrap text-base leading-relaxed text-slate-700">
            {profileText}
          </div>
        ) : (
          <p className="text-base leading-relaxed text-slate-600">{args.fallbackBody}</p>
        )}
        <SiteContentBlocks
          contentJson={parseContentBlocks(seo?.page?.content_json)}
          profile={profile as never}
        />
      </PageShell>
      <Footer title={title} />
    </>
  );
}

export async function generateTermsMetadata(slug: string): Promise<Metadata> {
  return generateTenantPageMetadata({ slug, path: "/terms", pageKey: "terms" });
}

export async function generatePrivacyMetadata(slug: string): Promise<Metadata> {
  return generateTenantPageMetadata({ slug, path: "/privacy", pageKey: "privacy" });
}

export async function TermsPageBody({ slug }: { slug: string }) {
  return renderLegalPage({
    slug,
    kind: "terms",
    fallbackH1: "Terms of use",
    fallbackBody:
      "Terms of use for this website will appear here once published by the operator.",
  });
}

export async function PrivacyPageBody({ slug }: { slug: string }) {
  return renderLegalPage({
    slug,
    kind: "privacy",
    fallbackH1: "Privacy policy",
    fallbackBody:
      "The privacy policy for this website will appear here once published by the operator.",
  });
}
