import { getSiteContext } from "@/lib/site";
import { Header, Footer } from "../_components/SiteChrome";
import { DollarSign, Check, X, Shield, Wifi } from "lucide-react";
import type { Metadata } from "next";
import {
  generateTenantPageMetadata,
  getTenantPageRenderData,
} from "@/lib/seo/page-render";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  return generateTenantPageMetadata({
    slug: resolvedParams.slug,
    path: "/prices",
    pageKey: "prices",
  });
}

export default async function PricesPage({ params }: PageProps) {
  const resolvedParams = await params;
  const ctx = await getSiteContext(resolvedParams.slug);
  const seo = await getTenantPageRenderData({
    slug: resolvedParams.slug,
    path: "/prices",
    pageKey: "prices",
  });

  if (!ctx) {
    if (process.env.NEXT_PUBLIC_DEBUG_SITE === "1") {
      console.warn("[SITE_GUARD] slug=", resolvedParams.slug, "no data found");
    }
    return (
      <main className="max-w-xl mx-auto py-24 px-4">
        <h1 className="text-2xl font-semibold mb-2">Site unavailable</h1>
        <p className="text-slate-600">This tenant site is not published.</p>
      </main>
    );
  }

  const profile = seo?.profile as Record<string, unknown> | null;
  const branding = ctx.branding;
  const title =
    (profile?.business_name as string) ||
    branding?.app_name ||
    ctx.tenant.name ||
    "Airport Parking";
  const h1 = seo?.page?.h1 || "Transparent Pricing";

  const { getServerSupabase } = await import("@/lib/supabase/server");
  const supabase = await getServerSupabase();

  const { data: pricing } = await supabase
    .from("tenant_pricing")
    .select("daily_rate")
    .eq("tenant_id", ctx.tenant.id)
    .single();

  const dailyRate = pricing?.daily_rate || 7.0;

  const features = [
    { icon: Shield, text: "24/7 CCTV Monitoring", included: true },
    { icon: Wifi, text: "Free WiFi", included: true },
    { icon: Check, text: "Secure Payment", included: true },
    { icon: Check, text: "Free Cancellation (24h)", included: true },
    { icon: Check, text: "Extension Available", included: true },
    { icon: X, text: "No Hidden Fees", included: false },
  ];

  return (
    <>
      {seo?.jsonLdScripts?.map((script, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: script }}
        />
      ))}
      <Header
        title={title}
        logoUrl={(profile?.logo_url as string) || undefined}
        tenantSlug={resolvedParams.slug}
      />
      <main className="max-w-4xl mx-auto px-4 pt-14 pb-10">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
            <DollarSign className="h-8 w-8 text-sky-600" />
            {h1}
          </h1>
          <p className="text-slate-600">
            {seo?.page?.excerpt ||
              seo?.page?.meta_description ||
              "Simple, clear pricing with no hidden fees. Pay only for what you use."}
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <div className="rounded-2xl border bg-white/70 backdrop-blur shadow-lg p-8">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-semibold text-slate-900 mb-2">Daily Rate</h2>
              <div className="text-4xl font-bold text-sky-600 mb-2">
                £{Number(dailyRate).toFixed(2)}
              </div>
              <p className="text-slate-600">per day</p>
            </div>

            <div className="space-y-4 mb-6">
              <div className="text-center">
                <p className="text-sm text-slate-600 mb-2">Example pricing:</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>1 day</span>
                    <span className="font-medium">£{Number(dailyRate).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>3 days</span>
                    <span className="font-medium">
                      £{(Number(dailyRate) * 3).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>7 days</span>
                    <span className="font-medium">
                      £{(Number(dailyRate) * 7).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>14 days</span>
                    <span className="font-medium">
                      £{(Number(dailyRate) * 14).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <a
              href="/book"
              className="block w-full text-center bg-sky-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-sky-700 transition-colors"
            >
              Book Now
            </a>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border bg-white/70 backdrop-blur shadow-lg p-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-4">What&apos;s Included</h2>
              <div className="grid grid-cols-1 gap-3">
                {features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div
                      className={`p-1 rounded-full ${
                        feature.included ? "bg-green-100" : "bg-red-100"
                      }`}
                    >
                      {feature.included ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <X className="h-4 w-4 text-red-600" />
                      )}
                    </div>
                    <feature.icon className="h-4 w-4 text-slate-500" />
                    <span className="text-slate-700">{feature.text}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border bg-white/70 backdrop-blur shadow-lg p-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-4">Booking Policy</h2>
              <div className="space-y-3 text-sm text-slate-700">
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Free cancellation up to 24 hours before arrival</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Secure payment processing via Stripe</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Instant booking confirmation</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Extension available for delayed flights</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-white/70 backdrop-blur shadow-lg p-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-4">Payment Methods</h2>
              <div className="space-y-2 text-sm text-slate-700">
                <p>We accept all major payment methods:</p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Visa, Mastercard, American Express</li>
                  <li>PayPal</li>
                  <li>Apple Pay & Google Pay</li>
                </ul>
                <p className="text-xs text-slate-500 mt-3">
                  All payments are processed securely through Stripe
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 rounded-2xl border bg-white/70 backdrop-blur shadow-lg p-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Need Help?</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium text-slate-900 mb-2">Questions about pricing?</h3>
              <p className="text-slate-600 text-sm mb-3">
                Our pricing is straightforward with no hidden fees. If you have any questions,
                we&apos;re here to help.
              </p>
              {branding?.contact_phone && (
                <a
                  href={`tel:${branding.contact_phone}`}
                  className="text-sky-600 hover:text-sky-700 font-medium text-sm"
                >
                  Call {branding.contact_phone}
                </a>
              )}
            </div>
            <div>
              <h3 className="font-medium text-slate-900 mb-2">Ready to book?</h3>
              <p className="text-slate-600 text-sm mb-3">
                Get started with your booking in just a few clicks. Secure, fast, and reliable.
              </p>
              <a
                href="/book"
                className="text-sky-600 hover:text-sky-700 font-medium text-sm"
              >
                Start Booking →
              </a>
            </div>
          </div>
        </div>
      </main>
      <Footer title={title} />
    </>
  );
}
