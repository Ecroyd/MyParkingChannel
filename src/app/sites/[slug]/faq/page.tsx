import { getSiteContext } from "@/lib/site";
import { Header, Footer } from "../_components/SiteChrome";
import { HelpCircle } from "lucide-react";
import FAQAccordion from "@/components/site/FAQAccordion";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getProfile(slug: string) {
  const ctx = await getSiteContext(slug);
  if (!ctx) return null;
  
  const { getServerSupabase } = await import("@/lib/supabase/server");
  const supabase = await getServerSupabase();
  
  const { data: profile } = await supabase
    .from("tenant_public_profile")
    .select("*")
    .eq("tenant_id", ctx.tenant.id)
    .maybeSingle();
    
  return { tenant: ctx.tenant, profile, branding: ctx.branding };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const data = await getProfile(resolvedParams.slug);
  
  if (!data) {
    return {
      title: "FAQ | Airport Parking",
      description: "Frequently asked questions about our airport parking service.",
    };
  }
  
  const title = `FAQ - ${data.profile?.business_name ?? data.branding?.app_name ?? "Airport Parking"}`;
  const description = "Frequently asked questions about our secure airport parking service, including booking, cancellation, and extension policies.";

  return {
    title,
    description,
  };
}


export default async function FAQPage({ params }: PageProps) {
  const resolvedParams = await params;
  const data = await getProfile(resolvedParams.slug);
  
  if (!data) {
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

  // Default FAQs if none are configured
  const defaultFAQs = [
    {
      q: "How do I book parking?",
      a: "Simply select your arrival and departure dates on our booking form, enter your vehicle details, and complete the secure payment. You'll receive a confirmation email with your booking reference."
    },
    {
      q: "Can I cancel or modify my booking?",
      a: "Yes, you can cancel your booking free of charge up to 24 hours before your arrival time. For modifications, please contact us directly."
    },
    {
      q: "What if my flight is delayed?",
      a: "No problem! You can extend your parking stay directly through our app or by calling our support team. We'll charge you only for the additional time used."
    },
    {
      q: "Is the parking secure?",
      a: "Yes, our facility is monitored 24/7 with CCTV cameras and has ANPR (Automatic Number Plate Recognition) entry systems for added security."
    },
    {
      q: "How do I get to the airport terminal?",
      a: "We provide a free shuttle service that runs regularly to and from the airport terminal. The journey typically takes 5-10 minutes."
    },
    {
      q: "Do you have EV charging facilities?",
      a: "Yes, we have electric vehicle charging points available. Please let us know when booking if you need to use these facilities."
    },
    {
      q: "Can I park oversized vehicles?",
      a: "Yes, we can accommodate larger vehicles including vans and motorhomes. Please contact us in advance to ensure we have suitable spaces available."
    },
    {
      q: "What payment methods do you accept?",
      a: "We accept all major credit and debit cards, as well as PayPal. All payments are processed securely through Stripe."
    }
  ];

  const faqs = p?.faq && Array.isArray(p.faq) && p.faq.length > 0 ? p.faq : defaultFAQs;

  return (
    <>
      <Header title={title} logoUrl={p?.logo_url} />
      <main className="max-w-4xl mx-auto px-4 pt-14 pb-10">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
            <HelpCircle className="h-8 w-8 text-sky-600" />
            Frequently Asked Questions
          </h1>
          <p className="text-slate-600">
            Find answers to common questions about our parking service, booking process, and policies.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <FAQAccordion faqs={faqs} />
          </div>

          <div className="space-y-6">
            {/* Contact Support */}
            <div className="rounded-2xl border bg-white/70 backdrop-blur shadow-lg p-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-4">Still have questions?</h2>
              <p className="text-slate-600 mb-4">
                Can't find what you're looking for? Our support team is here to help.
              </p>
              <div className="space-y-3">
                {branding?.contact_phone && (
                  <a
                    href={`tel:${branding.contact_phone}`}
                    className="block w-full text-center bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 transition-colors"
                  >
                    Call {branding.contact_phone}
                  </a>
                )}
                {branding?.contact_email && (
                  <a
                    href={`mailto:${branding.contact_email}`}
                    className="block w-full text-center border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Email Support
                  </a>
                )}
              </div>
            </div>

            {/* Quick Links */}
            <div className="rounded-2xl border bg-white/70 backdrop-blur shadow-lg p-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-4">Quick Links</h2>
              <div className="space-y-3">
                <a
                  href={`/sites/${resolvedParams.slug}/book`}
                  className="block text-sky-600 hover:text-sky-700 font-medium"
                >
                  Book Parking →
                </a>
                <a
                  href={`/sites/${resolvedParams.slug}/directions`}
                  className="block text-sky-600 hover:text-sky-700 font-medium"
                >
                  Get Directions →
                </a>
                <a
                  href={`/sites/${resolvedParams.slug}/prices`}
                  className="block text-sky-600 hover:text-sky-700 font-medium"
                >
                  View Prices →
                </a>
                <a
                  href={`/sites/${resolvedParams.slug}/contact`}
                  className="block text-sky-600 hover:text-sky-700 font-medium"
                >
                  Contact Us →
                </a>
              </div>
            </div>

            {/* Business Hours */}
            {p?.hours && Array.isArray(p.hours) && p.hours.length > 0 && (
              <div className="rounded-2xl border bg-white/70 backdrop-blur shadow-lg p-6">
                <h2 className="text-xl font-semibold text-slate-900 mb-4">Opening Hours</h2>
                <div className="space-y-2">
                  {p.hours.map((hour: any, index: number) => (
                    <div key={index} className="flex justify-between">
                      <span className="text-slate-700">{hour.day}</span>
                      <span className="text-slate-900 font-medium">
                        {hour.open} - {hour.close}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer title={title} />
    </>
  );
}
