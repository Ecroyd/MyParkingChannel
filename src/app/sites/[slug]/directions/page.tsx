import { getSiteContext } from "@/lib/site";
import { Header, Footer } from "../_components/SiteChrome";
import { MapPin, Navigation, Clock, Car } from "lucide-react";
import What3WordsMap from "@/components/maps/What3WordsMap";
import SimpleMap from "@/components/maps/SimpleMap";
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
      title: "Directions | Airport Parking",
      description: "Find directions to our secure airport parking facility.",
    };
  }
  
  const title = `Directions to ${data.profile?.business_name ?? data.branding?.app_name ?? "Airport Parking"}`;
  const description = `Get directions to our secure airport parking facility. ${data.profile?.address?.city ? `Located in ${data.profile.address.city}.` : ""}`;

  return {
    title,
    description,
  };
}

export default async function DirectionsPage({ params }: PageProps) {
  const resolvedParams = await params;
  const data = await getProfile(resolvedParams.slug);
  
  if (!data) {
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

  const { tenant, profile, branding } = data;
  const p = profile;
  const title = p?.business_name ?? branding?.app_name ?? tenant.name ?? "Airport Parking";

  const address = p?.address || {
    street: branding?.contact_address,
    city: branding?.contact_city,
    postalCode: branding?.contact_postcode,
    country: branding?.contact_country || "UK"
  };

  const fullAddress = [
    address?.street,
    address?.city,
    address?.postalCode,
    address?.country
  ].filter(Boolean).join(", ");

  return (
    <>
      <Header title={title} logoUrl={p?.logo_url} tenantSlug={resolvedParams.slug} />
      <main className="max-w-4xl mx-auto px-4 pt-14 pb-10">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-slate-900 mb-4">Directions</h1>
          <p className="text-slate-600">
            Find your way to our secure parking facility. We're conveniently located close to the terminal.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Address & Contact */}
          <div className="space-y-6">
            <div className="rounded-2xl border bg-white/70 backdrop-blur shadow-lg p-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Address
              </h2>
              {fullAddress ? (
                <div className="space-y-4">
                  <p className="text-slate-700">{fullAddress}</p>
                  
                  {/* What3Words Section */}
                  {p?.what3words && (
                    <div className="p-3 bg-sky-50 rounded-lg border border-sky-200">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="h-4 w-4 text-sky-600" />
                        <span className="text-sm font-medium text-sky-800">What3Words Location</span>
                      </div>
                      <p className="font-mono text-sky-700 text-lg mb-2">{p.what3words}</p>
                      <a
                        href={`https://what3words.com/${p.what3words.replace('///', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-sky-600 hover:text-sky-700 font-medium"
                      >
                        View on What3Words →
                      </a>
                    </div>
                  )}
                  
                  <a
                    href={`https://maps.google.com/maps?q=${encodeURIComponent(fullAddress)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 font-medium"
                  >
                    <Navigation className="h-4 w-4" />
                    Open in Google Maps
                  </a>
                </div>
              ) : (
                <p className="text-slate-500">Address information coming soon</p>
              )}
            </div>

            <div className="rounded-2xl border bg-white/70 backdrop-blur shadow-lg p-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Travel Time
              </h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-700">From Airport Terminal</span>
                  <span className="font-medium text-slate-900">5-10 minutes</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-700">By Car</span>
                  <span className="font-medium text-slate-900">2-5 minutes</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-700">By Shuttle</span>
                  <span className="font-medium text-slate-900">5-10 minutes</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-white/70 backdrop-blur shadow-lg p-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Car className="h-5 w-5" />
                Parking Access
              </h2>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                  <div>
                    <p className="font-medium text-slate-900">24/7 Access</p>
                    <p className="text-sm text-slate-600">Available around the clock</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                  <div>
                    <p className="font-medium text-slate-900">ANPR Entry</p>
                    <p className="text-sm text-slate-600">Automatic number plate recognition</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                  <div>
                    <p className="font-medium text-slate-900">Free Shuttle</p>
                    <p className="text-sm text-slate-600">Regular service to terminal</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Map */}
          <div className="space-y-6">
            <div className="rounded-2xl border bg-white/70 backdrop-blur shadow-lg p-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-4">Location Map</h2>
              {fullAddress || p?.what3words ? (
                <SimpleMap 
                  className="h-80 w-full"
                  lat={p?.latitude || 51.5074}
                  lng={p?.longitude || -0.1278}
                  zoom={15}
                  title={p?.business_name || "Parking Location"}
                />
              ) : (
                <div className="h-80 bg-slate-100 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <MapPin className="h-12 w-12 text-slate-400 mx-auto mb-2" />
                    <p className="text-slate-600">Map will be available once address is configured</p>
                  </div>
                </div>
              )}
            </div>

            {/* Contact Information */}
            {(branding?.contact_phone || branding?.contact_email) && (
              <div className="rounded-2xl border bg-white/70 backdrop-blur shadow-lg p-6">
                <h2 className="text-xl font-semibold text-slate-900 mb-4">Need Help?</h2>
                <div className="space-y-3">
                  {branding?.contact_phone && (
                    <div>
                      <p className="text-sm text-slate-600">Phone</p>
                      <a href={`tel:${branding.contact_phone}`} className="font-medium text-slate-900 hover:text-sky-600">
                        {branding.contact_phone}
                      </a>
                    </div>
                  )}
                  {branding?.contact_email && (
                    <div>
                      <p className="text-sm text-slate-600">Email</p>
                      <a href={`mailto:${branding.contact_email}`} className="font-medium text-slate-900 hover:text-sky-600">
                        {branding.contact_email}
                      </a>
                    </div>
                  )}
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