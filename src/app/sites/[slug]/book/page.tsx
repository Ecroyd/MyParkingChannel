import Link from "next/link";
import { getSiteContext } from "@/lib/site";
import { Header, Footer } from "../_components/SiteChrome";
import BookingHero from "@/components/booking/BookingHero";
import type { Metadata } from "next";
import { generateTenantPageMetadata, getTenantPageRenderData } from "@/lib/seo/page-render";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    path: "/book",
    pageKey: "book",
    searchParams: resolvedSearch,
  });
}

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const preview = resolvedSearchParams?.preview === "1";
  const slug = resolvedParams.slug;
  const ctx = await getSiteContext(slug, { preview });
  const seo = await getTenantPageRenderData({
    slug,
    path: "/book",
    pageKey: "book",
  });

  if (!ctx) {
    return <main className="mx-auto max-w-xl px-4 py-24">Site unavailable</main>;
  }

  const title = ctx.branding?.app_name || ctx.tenant.name || "Airport Parking";
  const h1 = seo?.page?.h1 || "Book airport parking";
  const tagline =
    seo?.page?.excerpt ||
    "Choose your dates, enter your details, and complete payment online.";

  return (
    <>
      <Header title={title} tenantSlug={resolvedParams.slug} />
      <BookingHero
        slug={resolvedParams.slug}
        tenantId={ctx.tenant.id}
        site={ctx.site}
        businessName={title}
        heading={h1}
        tagline={tagline}
      />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <ol className="mx-auto grid max-w-3xl gap-6 sm:grid-cols-3">
          {[
            ["Select dates", "Choose arrival and departure."],
            ["Enter details", "Contact info and vehicle registration."],
            ["Confirm & pay", "Complete your reservation securely."],
          ].map(([stepTitle, body], i) => (
            <li key={stepTitle} className="border-t border-slate-200 pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Step {i + 1}
              </p>
              <p className="mt-2 font-medium text-slate-900">{stepTitle}</p>
              <p className="mt-1 text-sm text-slate-600">{body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 text-center">
          <Link href="/" className="tenant-link text-sm">
            ← Back to home
          </Link>
        </div>
      </main>
      <Footer title={title} />
    </>
  );
}
