import Link from "next/link";
import { getSiteContext } from "@/lib/site";
import { Header, Footer } from "../_components/SiteChrome";
import BookingWidget from "@/components/booking/BookingWidget";

export const dynamic = "force-dynamic";

export default async function BookPage({ params, searchParams }: { params: Promise<{ slug: string }>, searchParams: Promise<{ preview?: string }> }) {
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
      <main className="max-w-6xl mx-auto px-4 py-10">
        <div className="grid lg:grid-cols-2 gap-10 items-start">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">Book airport parking</h1>
            <p className="text-slate-600 mt-2 mb-6">
              Secure your parking space with our easy online booking system. 
              Choose your dates, enter your details, and you're all set!
            </p>
            
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-sky-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-sky-600 text-sm font-medium">1</span>
                </div>
                <div>
                  <h3 className="font-medium">Select your dates</h3>
                  <p className="text-sm text-slate-600">Choose your arrival and departure dates</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-sky-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-sky-600 text-sm font-medium">2</span>
                </div>
                <div>
                  <h3 className="font-medium">Enter your details</h3>
                  <p className="text-sm text-slate-600">Provide your contact information and vehicle registration</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-sky-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-sky-600 text-sm font-medium">3</span>
                </div>
                <div>
                  <h3 className="font-medium">Confirm and pay</h3>
                  <p className="text-sm text-slate-600">Review your booking and complete your reservation</p>
                </div>
              </div>
            </div>
            
            <Link href="/" className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl border border-slate-300 hover:border-slate-400 mt-6">
              ← Back to home
            </Link>
          </div>
          
          <div className="lg:sticky lg:top-10">
            <BookingWidget 
              tenantSlug={resolvedParams.slug} 
              tenantId={ctx.tenant.id} 
            />
          </div>
        </div>
      </main>
      <Footer title={title} />
    </>
  );
}
