import Link from "next/link";
import { Suspense } from "react";
import { getSiteContext } from "@/lib/site";
import { Header, Footer } from "../_components/SiteChrome";
import BookingWidget from "@/components/booking/BookingWidget";
import BookingPageClient from "@/app/t/[slug]/book/BookingPageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BookPage({ params, searchParams }: { params: Promise<{ slug: string }>, searchParams: Promise<{ preview?: string }> }) {
  console.log("[BOOK_PAGE_HIT] route=/sites/[slug]/book file=app/sites/[slug]/book/page.tsx");
  
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const preview = resolvedSearchParams?.preview === "1";
  
  // Use params.slug explicitly - don't derive from host
  const slug = resolvedParams.slug;
  console.log("[BOOK_PAGE] Using slug from params:", slug);
  
  const ctx = await getSiteContext(slug, { preview });
  
  // Print full ctx to catch wrong property
  console.log("[BOOK_PAGE] ctx keys", ctx ? Object.keys(ctx) : null);
  console.log("[BOOK_PAGE] ctx.site", ctx?.site);
  console.log("[BOOK_PAGE] ctx", ctx);
  if (!ctx) {
    if (process.env.NEXT_PUBLIC_DEBUG_SITE === '1') {
      console.warn('[SITE_GUARD] no ctx for slug=', resolvedParams.slug)
    }
    return <main className="max-w-xl mx-auto py-24 px-4">Site unavailable</main>;
  }

  // From here, ctx is definitely defined
  if (process.env.NEXT_PUBLIC_DEBUG_SITE === '1') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbg = ctx as any;
    console.log('[SITE_GUARD] tenant', {
      slug: resolvedParams.slug,
      tenantId: dbg?.tenant?.id,
      publishFlags: {
        tenantStatus: dbg?.tenant?.status,
        profileIsActive: dbg?.profile?.is_active,
        profileStatus: dbg?.profile?.status,
        derivedPublished: dbg?.tenant?.status === 'active' && (dbg?.profile?.is_active || dbg?.profile?.status === 'active')
      }
    })
  }

  const title = ctx.branding?.app_name || ctx.tenant.name || "Airport Parking";
  
  // Explicit logging and style selection
  console.log('[BOOK_PAGE] ctx.site', ctx.site);
  console.log('[BOOK_PAGE] booking_modal_style', ctx.site?.booking_modal_style);
  
  // TEMPORARY: Force banner to test UI rendering
  // const modalStyle = "banner";
  const modalStyle = (ctx.site?.booking_modal_style ?? "card").toLowerCase();
  console.log('[BOOK_PAGE] Final modalStyle decision:', modalStyle);

  // If banner style, show the banner modal instead of the widget
  if (modalStyle === "banner") {
    return (
      <>
        <Header title={title} tenantSlug={resolvedParams.slug} />
        <main className="max-w-6xl mx-auto px-4 py-10">
          <h1 className="text-2xl md:text-3xl font-semibold mb-4">Book airport parking</h1>
          <Suspense fallback={<div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">Loading...</div>}>
            <BookingPageClient slug={resolvedParams.slug} bookingModalStyle={modalStyle as 'card' | 'banner'} />
          </Suspense>
        </main>
        <Footer title={title} />
      </>
    );
  }

  // Default: show the widget (card style)
  return (
    <>
      <Header title={title} tenantSlug={resolvedParams.slug} />
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
