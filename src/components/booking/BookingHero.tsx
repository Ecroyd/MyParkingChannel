import BookingBannerHero from "./BookingBannerHero";
import BookingWidget from "./BookingWidget";

type SiteLike = {
  booking_modal_style?: string | null;
};

interface BookingHeroProps {
  slug: string;
  tenantId: string;
  site: SiteLike | null;
  businessName?: string;
  tagline?: string;
}

export default function BookingHero({ slug, tenantId, site, businessName, tagline }: BookingHeroProps) {
  const style = (site?.booking_modal_style ?? "card").toLowerCase();

  if (style === "banner") {
    return (
      <section className="w-full bg-white border-b">
        <BookingBannerHero slug={slug} />
      </section>
    );
  }

  // Card style = classic hero
  return (
    <section className="relative bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto max-w-6xl px-6 py-20 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <h1 className="text-4xl font-semibold">{businessName || "Airport Parking"}</h1>
          <p className="mt-4 text-lg text-slate-600">
            {tagline || "Secure parking, clear pricing, easy check-in. Close to the terminal."}
          </p>
        </div>

        <div className="relative">
          <BookingWidget tenantSlug={slug} tenantId={tenantId} />
        </div>
      </div>
    </section>
  );
}
