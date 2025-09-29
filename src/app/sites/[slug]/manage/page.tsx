import { getSiteContext } from "@/lib/site";
import { Header, Footer } from "../_components/SiteChrome";

export const dynamic = "force-dynamic";

export default async function ManagePage({ params, searchParams }: { params: Promise<{ slug: string }>, searchParams: Promise<{ preview?: string }> }) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const preview = resolvedSearchParams?.preview === "1";
  const ctx = await getSiteContext(resolvedParams.slug, { preview });
  if (!ctx) {
    if (process.env.NEXT_PUBLIC_DEBUG_SITE === '1') {
      console.warn('[SITE_GUARD] slug=', resolvedParams.slug, 'tenantId=', ctx?.tenant?.id, 'site_published=', ctx?.tenant?.site_published)
    }
    return <main className="max-w-xl mx-auto py-24 px-4">Site unavailable</main>;
  }
  const title = ctx.branding?.app_name || ctx.tenant.name || "Airport Parking";

  return (
    <>
      <Header title={title} />
      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl md:text-3xl font-semibold">Manage your booking</h1>
        <p className="text-slate-600 mt-2">Lookup by reference coming soon.</p>
      </main>
      <Footer title={title} />
    </>
  );
}
