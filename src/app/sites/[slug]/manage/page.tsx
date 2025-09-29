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
      console.warn('[SITE_GUARD] no ctx for slug=', resolvedParams.slug)
    }
    return <main className="max-w-xl mx-auto py-24 px-4">Site unavailable</main>;
  }

  // From here, ctx is definitely defined
  if (process.env.NEXT_PUBLIC_DEBUG_SITE === '1') {
    console.log('[SITE_GUARD] tenant', {
      slug: resolvedParams.slug,
      tenantId: (ctx as any)?.tenant?.id,
      publishFlags: {
        tenantStatus: (ctx as any)?.tenant?.status,
        profileIsActive: (ctx as any)?.profile?.is_active,
        profileStatus: (ctx as any)?.profile?.status,
        derivedPublished: (ctx as any)?.tenant?.status === 'active' && ((ctx as any)?.profile?.is_active || (ctx as any)?.profile?.status === 'active')
      }
    })
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
