import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
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
  heading?: string;
  tagline?: string;
  eyebrow?: string | null;
  trustPoints?: string[];
  heroImageUrl?: string | null;
  heroImageAlt?: string | null;
}

export default function BookingHero({
  slug,
  tenantId,
  site,
  businessName,
  heading,
  tagline,
  eyebrow,
  trustPoints,
  heroImageUrl,
  heroImageAlt,
}: BookingHeroProps) {
  const style = (site?.booking_modal_style ?? "card").toLowerCase();
  const h1 = heading || "Airport parking made simple";
  const subtitle =
    tagline ||
    "Secure parking, straightforward pricing and an easy arrival experience.";
  const points = (trustPoints || []).slice(0, 3);

  if (style === "banner") {
    return (
      <section id="parking" className="w-full border-b border-slate-200 bg-white">
        <BookingBannerHero slug={slug} tenantId={tenantId} />
      </section>
    );
  }

  return (
    <section
      id="parking"
      className="relative overflow-hidden border-b border-slate-200/80"
    >
      {/* Background: image + overlay, or brand tonal split */}
      {heroImageUrl ? (
        <div className="pointer-events-none absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroImageUrl}
            alt={heroImageAlt || ""}
            width={1920}
            height={1080}
            className="h-full w-full object-cover"
            fetchPriority="high"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-950/70 to-slate-900/45" />
        </div>
      ) : (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 80% 60% at 10% 20%, color-mix(in srgb, var(--tenant-primary, #1e40af) 28%, transparent), transparent 55%),
              radial-gradient(ellipse 70% 50% at 90% 80%, color-mix(in srgb, var(--tenant-secondary, #65a30d) 12%, transparent), transparent 50%),
              linear-gradient(135deg, #0f172a 0%, #1e293b 42%, color-mix(in srgb, var(--tenant-primary, #1e40af) 55%, #0f172a) 100%)
            `,
          }}
        />
      )}

      <div className="relative mx-auto grid min-h-[560px] w-full max-w-[1240px] items-center gap-10 px-4 py-12 sm:px-6 sm:py-14 lg:grid-cols-[1.12fr_0.88fr] lg:gap-14 lg:px-8 lg:py-16">
        <div className="max-w-xl text-white lg:max-w-none">
          {eyebrow ? (
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-white/75 sm:text-[13px]">
              {eyebrow}
            </p>
          ) : null}

          <h1 className="max-w-[18ch] text-[2.125rem] font-semibold leading-[1.12] tracking-tight sm:text-[2.5rem] md:text-[2.75rem] lg:text-[3.25rem] lg:leading-[1.08]">
            {h1}
          </h1>

          <p className="mt-5 max-w-lg text-base leading-relaxed text-white/85 sm:text-lg sm:leading-relaxed">
            {subtitle}
          </p>

          {points.length > 0 ? (
            <ul className="mt-8 space-y-3.5">
              {points.map((point) => (
                <li key={point} className="flex items-start gap-3 text-[15px] text-white/90 sm:text-base">
                  <CheckCircle2
                    className="mt-0.5 h-5 w-5 shrink-0"
                    style={{ color: "var(--tenant-secondary, #a3e635)" }}
                    aria-hidden
                  />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-9">
            <Link
              href="/directions"
              className="inline-flex h-12 items-center rounded-lg border border-white/30 bg-white/5 px-5 text-[15px] font-semibold text-white backdrop-blur-sm transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Get directions
            </Link>
          </div>
        </div>

        <div
          id="booking"
          className="scroll-mt-28 w-full justify-self-stretch lg:max-w-[460px] lg:justify-self-end"
        >
          <BookingWidget tenantSlug={slug} tenantId={tenantId} />
        </div>
      </div>

      {/* businessName kept for a11y context; not rendered as a second logo/H1 */}
      <span className="sr-only">{businessName}</span>
    </section>
  );
}
