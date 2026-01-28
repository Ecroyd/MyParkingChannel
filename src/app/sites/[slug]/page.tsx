import Link from "next/link";
import { getSiteContext } from "@/lib/site";
import { Header, Footer } from "./_components/SiteChrome";
import BookingHero from "@/components/booking/BookingHero";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    console.log("Tenant ID:", ctx.tenant.id);
    console.log("Site from ctx on homepage:", ctx.site);
  }
    
  return { tenant: ctx.tenant, profile, branding: ctx.branding, site: ctx.site ?? null };
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
      console.warn('[SITE_GUARD] slug=', resolvedParams.slug, 'no data found')
    }
    return (
      <main className="max-w-xl mx-auto py-24 px-4">
        <h1 className="text-2xl font-semibold mb-2">Site unavailable</h1>
        <p className="text-slate-600">This tenant site is not published.</p>
      </main>
    );
  }

  const { tenant, profile, branding, site } = data;
  const p = profile;
  const title = p?.business_name ?? branding?.app_name ?? tenant.name ?? "Airport Parking";

  console.log("[HOME_PAGE] booking_modal_style", site?.booking_modal_style);

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
      
      <Header title={title} logoUrl={p?.logo_url} tenantSlug={resolvedParams.slug} />
      
      {/* Booking Hero - banner or card, decided once */}
      <BookingHero 
        slug={resolvedParams.slug}
        tenantId={tenant.id}
        site={site}
        businessName={p?.business_name ?? branding?.app_name ?? tenant.name}
        tagline={p?.short_tagline}
      />

      {/* Everything below is now "content", not hero */}
      <main className="mx-auto max-w-6xl px-6 py-12 space-y-12">
        {/* Logo and intro section (only show if banner style, otherwise already in hero) */}
        {site?.booking_modal_style?.toLowerCase() === "banner" && (
          <section className="text-center">
            {/* Large Logo */}
            {p?.logo_url && (
              <div className="mb-8 flex justify-center">
                <img 
                  src={p.logo_url} 
                  alt={p?.business_name ?? branding?.app_name ?? "Airport Parking"} 
                  className="h-72 w-auto max-w-96 object-contain shadow-sm"
                />
              </div>
            )}
            <h1 className="text-4xl font-semibold tracking-tight text-slate-900 mb-6">
              {p?.business_name ?? branding?.app_name ?? "Airport Parking"}
            </h1>
            <p className="mt-3 text-lg text-gray-600 mb-6">
              {p?.short_tagline ?? "Secure parking, clear pricing, easy check-in. Close to the terminal."}
            </p>
            
            {/* Features/USPs */}
            <ul className="mt-6 grid grid-cols-2 gap-2 text-sm text-gray-700 mb-8 max-w-2xl mx-auto">
              {(p?.features ?? ["CCTV", "24/7 Access"]).map((f: string) => (
                <li key={f} className="rounded-xl border px-3 py-2 bg-white/70 backdrop-blur shadow-sm">
                  {f}
                </li>
              ))}
            </ul>
            
            <div className="mt-6 flex gap-3 justify-center">
              <Link href="/directions" className="rounded-2xl border border-slate-300 px-5 py-3 font-medium hover:bg-slate-50 transition-colors">
                Directions
              </Link>
            </div>
          </section>
        )}

        {/* PRICING + INFO */}
        <section className="mt-12 grid lg:grid-cols-3 gap-6 mb-16">
          <div className="rounded-2xl border bg-white/70 backdrop-blur shadow-lg p-5">
            <h2 className="font-medium mb-2 text-slate-900">Pricing</h2>
            <p className="text-slate-600 mb-3">Transparent daily rates. No hidden fees.</p>
            <Link className="inline-block mt-3 text-sm underline text-sky-600 hover:text-sky-700" href="/prices">
              See prices
            </Link>
          </div>
          <div className="rounded-2xl border bg-white/70 backdrop-blur shadow-lg p-5">
            <h2 className="font-medium mb-2 text-slate-900">Close to terminal</h2>
            <p className="text-slate-600 mb-3">
              Typically {p?.airports?.[0] ? `${p.airports[0]} airport` : "the airport"} in 5–10 minutes.
            </p>
            <Link className="inline-block mt-3 text-sm underline text-sky-600 hover:text-sky-700" href="/directions">
              Get directions
            </Link>
          </div>
          <div className="rounded-2xl border bg-white/70 backdrop-blur shadow-lg p-5">
            <h2 className="font-medium mb-2 text-slate-900">Support</h2>
            <p className="text-slate-600 mb-3">Have a late return or flight change? We'll extend your booking at the gate.</p>
            <Link className="inline-block mt-3 text-sm underline text-sky-600 hover:text-sky-700" href="/faq">
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