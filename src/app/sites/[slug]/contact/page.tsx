import { getSiteContext } from "@/lib/site";
import { Header, Footer } from "../_components/SiteChrome";

export const dynamic = "force-dynamic";

export default async function ContactPage({ params, searchParams }: { params: Promise<{ slug: string }>, searchParams: Promise<{ preview?: string }> }) {
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
        <h1 className="text-2xl md:text-3xl font-semibold">Contact us</h1>
        <p className="text-slate-600 mt-2">Questions about arrival or your booking? We're here to help.</p>
        <div className="mt-6 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm text-slate-700">
          {ctx.branding?.contact_email && (
            <div className="mb-3">
              <strong>Email:</strong> {ctx.branding.contact_email}
            </div>
          )}
          {ctx.branding?.contact_phone && (
            <div className="mb-3">
              <strong>Phone:</strong> {ctx.branding.contact_phone}
            </div>
          )}
          {(ctx.branding?.contact_address || ctx.branding?.contact_city || ctx.branding?.contact_postcode) && (
            <div className="mb-3">
              <strong>Address:</strong>{" "}
              {[
                ctx.branding?.contact_address,
                ctx.branding?.contact_city,
                ctx.branding?.contact_postcode
              ].filter(Boolean).join(", ")}
            </div>
          )}
          {ctx.branding?.business_hours && (
            <div className="mb-3">
              <strong>Business Hours:</strong> {ctx.branding.business_hours}
            </div>
          )}
          {ctx.branding?.website_url && (
            <div>
              <strong>Website:</strong>{" "}
              <a 
                href={ctx.branding.website_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                {ctx.branding.website_url}
              </a>
            </div>
          )}
        </div>
      </main>
      <Footer title={title} />
    </>
  );
}
