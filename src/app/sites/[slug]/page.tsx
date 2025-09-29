import Link from "next/link";
import { getSiteContext } from "@/lib/site";
import { Header, Footer } from "./_components/SiteChrome";
import BookingWidget from "@/components/booking/BookingWidget";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

async function getProfile(slug: string) {
  const ctx = await getSiteContext(slug);
  if (!ctx) return null;
  
  // Get public profile data
  const { createServerClient } = await import("@/lib/supabase/server");
  const supabase = await createServerClient();
  
  const { data: profile, error: profileError } = await supabase
    .from("tenant_public_profile")
    .select("*")
    .eq("tenant_id", ctx.tenant.id)
    .maybeSingle();
    
  if (profileError) {
    console.error("Error loading tenant profile:", profileError);
  } else {
    console.log("Loaded tenant profile:", profile);
    console.log("Logo URL from database:", profile?.logo_url);
  }
    
  return { tenant: ctx.tenant, profile, branding: ctx.branding };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const data = await getProfile(resolvedParams.slug);
  
  if (!data) {
    return {
      title: "Airport Parking | Book Secure Parking",
      description: "Secure airport parking with CCTV, 24/7 access and fast shuttle.",
    };
  }
  
  const title = data.profile?.meta_title ?? `${data.profile?.business_name ?? data.branding?.app_name ?? "Airport Parking"} | Book Secure Parking`;
  const description = data.profile?.meta_description ?? "Secure airport parking with CCTV, 24/7 access and fast shuttle.";
  const baseUrl = `https://myparkingchannel.app/sites/${resolvedParams.slug}`;

  return {
    title,
    description,
    alternates: { canonical: baseUrl },
    openGraph: {
      title,
      description,
      url: baseUrl,
      siteName: data.profile?.business_name ?? data.branding?.app_name ?? "Airport Parking",
      type: "website",
    },
    twitter: { 
      card: "summary_large_image", 
      title, 
      description 
    },
  };
}

export default async function TenantHome({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const preview = resolvedSearchParams?.preview === "1";
  const data = await getProfile(resolvedParams.slug);
  
  if (!data) {
    // Hide draft sites unless ?preview=1
    if (process.env.NEXT_PUBLIC_DEBUG_SITE === '1') {
      console.warn('[SITE_GUARD] slug=', resolvedParams.slug, 'tenantId=', data?.tenant?.id, 'site_published=', data?.tenant?.site_published)
    }
    return (
      <main className="max-w-xl mx-auto py-24 px-4">
        <h1 className="text-2xl font-semibold mb-2">Site unavailable</h1>
        <p className="text-slate-600">This tenant site is not published.</p>
      </main>
    );
  }

  const { tenant, profile, branding } = data;
  const p = profile;
  const title = p?.business_name ?? branding?.app_name ?? tenant.name ?? "Airport Parking";

  // JSON-LD (ParkingFacility + LocalBusiness + AggregateRating + FAQ)
  const ld = {
    "@context": "https://schema.org",
    "@type": "ParkingFacility",
    "name": p?.business_name ?? branding?.app_name,
    "url": `https://myparkingchannel.app/sites/${resolvedParams.slug}`,
    "priceRange": p?.price_range ?? "££",
    "telephone": p?.phone ?? branding?.contact_phone,
    "email": p?.email ?? branding?.contact_email,
    "address": p?.address ? { 
      "@type": "PostalAddress", 
      ...p.address 
    } : (branding?.contact_address ? {
      "@type": "PostalAddress",
      streetAddress: branding.contact_address,
      addressLocality: branding.contact_city,
      postalCode: branding.contact_postcode,
      addressCountry: branding.contact_country || "UK"
    } : undefined),
    "geo": p?.geo ? { 
      "@type": "GeoCoordinates", 
      latitude: p.geo.lat, 
      longitude: p.geo.lng 
    } : undefined,
    "aggregateRating": p?.review_count ? { 
      "@type": "AggregateRating", 
      ratingValue: p.review_rating ?? 4.8, 
      reviewCount: p.review_count 
    } : undefined,
    "openingHoursSpecification": Array.isArray(p?.hours)
      ? p!.hours.map((h: any) => ({
          "@type": "OpeningHoursSpecification", 
          dayOfWeek: h.day, 
          opens: h.open, 
          closes: h.close 
        }))
      : undefined,
  };

  const faqLd = Array.isArray(p?.faq) && p!.faq.length ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": p!.faq.map((f: any) => ({
      "@type": "Question",
      "name": f.q,
      "acceptedAnswer": { "@type": "Answer", "text": f.a }
    }))
  } : null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />}
      
      <Header title={title} logoUrl={p?.logo_url} />
      <main className="max-w-6xl mx-auto px-4 pt-14 pb-10">
        {/* HERO */}
        <section className="grid lg:grid-cols-2 gap-8 items-center mb-16">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-900 mb-6">
              {p?.business_name ?? branding?.app_name ?? "Airport Parking"}, made simple.
            </h1>
            <p className="mt-3 text-lg text-gray-600 mb-6">
              {p?.short_tagline ?? "Secure parking, clear pricing, easy check-in. Close to the terminal."}
            </p>
            
            {/* Features/USPs */}
            <ul className="mt-6 grid grid-cols-2 gap-2 text-sm text-gray-700 mb-8">
              {(p?.features ?? ["CCTV", "24/7 Access", "Free Shuttle", "ANPR-protected"]).map((f: string) => (
                <li key={f} className="rounded-xl border px-3 py-2 bg-white/70 backdrop-blur shadow-sm">
                  {f}
                </li>
              ))}
            </ul>
            
            <div className="mt-6 flex gap-3">
              <Link href="#book" className="rounded-2xl bg-black text-white px-5 py-3 font-medium hover:bg-gray-800 transition-colors">
                Book parking
              </Link>
              <Link href={`/sites/${resolvedParams.slug}/directions`} className="rounded-2xl border border-slate-300 px-5 py-3 font-medium hover:bg-slate-50 transition-colors">
                Directions
              </Link>
            </div>
          </div>

          {/* Booking widget slot */}
          <div id="book" className="rounded-2xl border bg-white/70 backdrop-blur shadow-lg p-4">
            <BookingWidget 
              tenantSlug={resolvedParams.slug} 
              tenantId={tenant.id} 
            />
            <p className="mt-2 text-xs text-center text-gray-500">
              Secure payments by Stripe • Free cancellations within 24h
            </p>
          </div>
        </section>

        {/* PRICING + INFO */}
        <section className="mt-12 grid lg:grid-cols-3 gap-6 mb-16">
          <div className="rounded-2xl border bg-white/70 backdrop-blur shadow-lg p-5">
            <h2 className="font-medium mb-2 text-slate-900">Pricing</h2>
            <p className="text-slate-600 mb-3">Transparent daily rates. No hidden fees.</p>
            <Link className="inline-block mt-3 text-sm underline text-sky-600 hover:text-sky-700" href={`/sites/${resolvedParams.slug}/prices`}>
              See prices
            </Link>
          </div>
          <div className="rounded-2xl border bg-white/70 backdrop-blur shadow-lg p-5">
            <h2 className="font-medium mb-2 text-slate-900">Close to terminal</h2>
            <p className="text-slate-600 mb-3">
              Typically {p?.airports?.[0] ? `${p.airports[0]} airport` : "the airport"} in 5–10 minutes.
            </p>
            <Link className="inline-block mt-3 text-sm underline text-sky-600 hover:text-sky-700" href={`/sites/${resolvedParams.slug}/directions`}>
              Get directions
            </Link>
          </div>
          <div className="rounded-2xl border bg-white/70 backdrop-blur shadow-lg p-5">
            <h2 className="font-medium mb-2 text-slate-900">Support</h2>
            <p className="text-slate-600 mb-3">Have a late return or flight change? We'll extend your booking at the gate.</p>
            <Link className="inline-block mt-3 text-sm underline text-sky-600 hover:text-sky-700" href={`/sites/${resolvedParams.slug}/faq`}>
              Read FAQs
            </Link>
          </div>
        </section>

        {/* REVIEWS */}
        {!!p?.review_count && (
          <section className="mt-12 rounded-2xl border bg-white/70 backdrop-blur shadow-lg p-5 mb-16">
            <h2 className="font-medium text-slate-900 mb-2">What drivers say</h2>
            <p className="text-sm text-gray-600">
              Rated {p.review_rating} / 5 by {p.review_count}+ customers
            </p>
          </section>
        )}
      </main>
      <Footer title={title} />
    </>
  );
}