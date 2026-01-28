import Link from "next/link";
import { getTenantContext } from "@/lib/site";
import { Header, Footer } from "../_components/Chrome";
import BookingHero from "@/components/booking/BookingHero";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  console.log("[BOOK_PAGE_HIT] route=/t/[slug]/book file=app/t/[slug]/book/page.tsx");
  
  const { slug } = await params;
  console.log("[BOOK_PAGE] Using slug from params:", slug);
  
  const ctx = await getTenantContext(slug);
  
  // Print full ctx to catch wrong property
  console.log("[BOOK_PAGE] ctx keys", ctx ? Object.keys(ctx) : null);
  console.log("[BOOK_PAGE] ctx.site", ctx?.site);
  console.log("[BOOK_PAGE] ctx", ctx);
  if (!ctx) return <main className="max-w-xl mx-auto py-24 px-4">Unknown tenant.</main>;

  const title = ctx.branding?.app_name || ctx.tenant.name || "Airport Parking";
  
  // Explicit logging and style selection
  console.log('[BOOK_PAGE] ctx.site', ctx.site);
  console.log('[BOOK_PAGE] booking_modal_style', ctx.site?.booking_modal_style);
  
  const modalStyle = (ctx.site?.booking_modal_style ?? "card").toLowerCase();
  console.log('[BOOK_PAGE] Final modalStyle decision:', modalStyle);
  
  return (
    <>
      <Header title={title} slug={slug} />
      
      {/* Booking Hero - banner or card, decided once */}
      <BookingHero 
        slug={slug}
        tenantId={ctx.tenant.id}
        site={ctx.site}
        businessName={title}
        tagline="Secure your parking space with our easy online booking system."
      />

      {/* Content below hero */}
      <main className="mx-auto max-w-6xl px-6 py-12">
        {/* Instructions section (only show if banner style, otherwise already in hero) */}
        {modalStyle === "banner" && (
          <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl md:text-3xl font-semibold mb-6">Book airport parking</h1>
            <p className="text-slate-600 mb-8">
              Choose your dates, enter your details, and you're all set!
            </p>
            
            <div className="space-y-4 mb-8">
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
          </div>
        )}
        
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl border border-slate-300 hover:border-slate-400">
            ← Back to home
          </Link>
        </div>
      </main>
      
      <Footer title={title} />
    </>
  );
}
