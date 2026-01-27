import { Suspense } from "react";
import { getTenantContext } from "@/lib/site";
import { Header, Footer } from "../_components/Chrome";
import BookingPageClient from "./BookingPageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  if (!ctx) return <main className="max-w-xl mx-auto py-24 px-4">Unknown tenant.</main>;

  const title = ctx.branding?.app_name || ctx.tenant.name || "Airport Parking";
  
  // Explicit logging and style selection
  console.log('[BOOK_PAGE] ctx.site', ctx.site);
  console.log('[BOOK_PAGE] booking_modal_style', ctx.site?.booking_modal_style);
  
  const modalStyle = (ctx.site?.booking_modal_style ?? "card").toLowerCase();
  
  return (
    <>
      <Header title={title} slug={slug} />
      <main className="max-w-6xl mx-auto px-4 py-10">
        <h1 className="text-2xl md:text-3xl font-semibold mb-4">Book airport parking</h1>
        <Suspense fallback={<div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">Loading...</div>}>
          <BookingPageClient slug={slug} bookingModalStyle={modalStyle as 'card' | 'banner'} />
        </Suspense>
      </main>
      <Footer title={title} />
    </>
  );
}
