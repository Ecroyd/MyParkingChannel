import Link from "next/link";
import {
  CheckCircle2,
  MapPin,
  Phone,
  Mail,
  Navigation,
  Shield,
  Clock,
  Car,
  type LucideIcon,
} from "lucide-react";
import type { FaqItem, ListItem } from "@/lib/seo/content-blocks";
import { hasUsableAddress } from "@/lib/seo/homepage-model";

const SHELL = "mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8";
const SECTION_Y = "py-16 sm:py-20 lg:py-24";

const ICONS: Record<string, LucideIcon> = {
  check: CheckCircle2,
  map: MapPin,
  shield: Shield,
  clock: Clock,
  car: Car,
  phone: Phone,
  mail: Mail,
  navigation: Navigation,
};

function Icon({ name, className }: { name?: string; className?: string }) {
  const Comp = (name && ICONS[name]) || CheckCircle2;
  return <Comp className={className ?? "h-6 w-6"} aria-hidden />;
}

export function TrustStrip({ points }: { points: string[] }) {
  if (!points.length) return null;
  return (
    <section
      aria-label="Highlights"
      className="border-y border-slate-200 bg-white"
    >
      <ul
        className={`${SHELL} grid grid-cols-2 gap-x-6 gap-y-8 py-8 sm:py-10 lg:grid-cols-4 lg:gap-8`}
      >
        {points.slice(0, 4).map((point) => (
          <li key={point} className="flex items-start gap-3.5">
            <span
              className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--tenant-primary, #1e40af) 12%, white)",
                color: "var(--tenant-primary, #1e40af)",
              }}
            >
              <CheckCircle2 className="h-5 w-5" aria-hidden />
            </span>
            <span className="pt-1.5 text-[15px] font-semibold leading-snug text-slate-900 sm:text-base">
              {point}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HowItWorksSection({
  heading,
  intro,
  steps,
}: {
  heading?: string;
  intro?: string;
  steps: ListItem[];
}) {
  if (!steps.length) return null;
  return (
    <section id="how-it-works" className={`bg-slate-50 ${SECTION_Y}`}>
      <div className={SHELL}>
        <div className="mx-auto max-w-2xl text-center">
          <p
            className="text-xs font-semibold uppercase tracking-[0.16em]"
            style={{ color: "var(--tenant-primary, #1e40af)" }}
          >
            Simple process
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-[2.125rem]">
            {heading || "How it works"}
          </h2>
          {intro ? (
            <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">
              {intro}
            </p>
          ) : (
            <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">
              Reserve online, arrive on the day, and continue to the terminal with confidence.
            </p>
          )}
        </div>

        <ol className="relative mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {steps.slice(0, 3).map((step, i) => (
            <li key={step.title + i} className="relative text-center sm:text-left">
              {i < Math.min(steps.length, 3) - 1 ? (
                <div
                  className="pointer-events-none absolute left-[calc(50%+2rem)] right-[-2rem] top-6 hidden h-px bg-slate-200 sm:block"
                  aria-hidden
                />
              ) : null}
              <div className="flex flex-col items-center sm:items-start">
                <span
                  className="relative z-[1] flex h-12 w-12 items-center justify-center rounded-full text-lg font-semibold"
                  style={{
                    backgroundColor: "var(--tenant-action, #1e40af)",
                    color: "var(--tenant-action-fg, #fff)",
                  }}
                >
                  {i + 1}
                </span>
                <h3 className="mt-5 text-xl font-semibold text-slate-900">{step.title}</h3>
                {step.body ? (
                  <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-slate-600 sm:text-base">
                    {step.body}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function BenefitsSection({
  heading,
  intro,
  items,
  imageUrl,
  imageAlt,
}: {
  heading?: string;
  intro?: string;
  items: ListItem[];
  imageUrl?: string | null;
  imageAlt?: string | null;
}) {
  if (!items.length) return null;
  return (
    <section className={`bg-white ${SECTION_Y}`}>
      <div className={SHELL}>
        {imageUrl ? (
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={imageAlt || heading || "Parking facility"}
                width={900}
                height={700}
                className="aspect-[4/3] w-full object-cover"
                loading="lazy"
              />
            </div>
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-[2.125rem]">
                {heading || "Why choose us"}
              </h2>
              {intro ? (
                <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">{intro}</p>
              ) : null}
              <ul className="mt-8 space-y-5">
                {items.slice(0, 6).map((item, i) => (
                  <li key={item.title + i} className="flex gap-4">
                    <span
                      className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        backgroundColor:
                          "color-mix(in srgb, var(--tenant-primary, #1e40af) 12%, white)",
                        color: "var(--tenant-primary, #1e40af)",
                      }}
                    >
                      <Icon name={item.icon} className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
                      {item.body ? (
                        <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600">
                          {item.body}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="grid items-start gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-[2.125rem]">
                {heading || "Why choose us"}
              </h2>
              {intro ? (
                <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">{intro}</p>
              ) : (
                <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">
                  Straightforward airport parking with clear pricing and an easy arrival experience.
                </p>
              )}
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {items.slice(0, 6).map((item, i) => (
                <li
                  key={item.title + i}
                  className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6"
                >
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--tenant-primary, #1e40af) 12%, white)",
                      color: "var(--tenant-primary, #1e40af)",
                    }}
                  >
                    <Icon name={item.icon} className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-slate-900">{item.title}</h3>
                  {item.body ? (
                    <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{item.body}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

export function LocationSection({
  heading,
  body,
  businessName,
  address,
  phone,
  email,
  airports,
  what3words,
  latitude,
  longitude,
  imageUrl,
  imageAlt,
}: {
  heading?: string;
  body?: string;
  businessName?: string | null;
  address?: unknown;
  phone?: string | null;
  email?: string | null;
  airports?: string[] | null;
  what3words?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
}) {
  const usableAddress = hasUsableAddress(address);
  const a = (address && typeof address === "object" ? address : {}) as Record<
    string,
    string
  >;
  const lines = [
    a.street || a.streetAddress,
    [a.city || a.addressLocality, a.postalCode].filter(Boolean).join(" "),
  ].filter(Boolean) as string[];

  const airport =
    Array.isArray(airports) && airports[0] ? String(airports[0]) : null;
  const hasCoords = latitude != null && longitude != null && String(latitude) !== "" && String(longitude) !== "";
  const hasAny =
    usableAddress ||
    phone?.trim() ||
    email?.trim() ||
    airport ||
    what3words?.trim() ||
    hasCoords ||
    body?.trim();

  if (!hasAny) return null;

  const mapsQuery = hasCoords
    ? `${latitude},${longitude}`
    : lines.join(", ");

  return (
    <section id="location" className={`bg-slate-50 ${SECTION_Y}`}>
      <div className={`${SHELL} grid items-stretch gap-10 lg:grid-cols-2 lg:gap-14`}>
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-[2.125rem]">
            {heading || "Location & directions"}
          </h2>
          {body ? (
            <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
              {body}
            </p>
          ) : null}
          <dl className="mt-8 space-y-4 text-[15px]">
            {usableAddress ? (
              <div>
                <dt className="text-sm font-medium text-slate-500">Address</dt>
                <dd className="mt-1 text-base text-slate-900">{lines.join(", ")}</dd>
              </div>
            ) : null}
            {airport ? (
              <div>
                <dt className="text-sm font-medium text-slate-500">Airport served</dt>
                <dd className="mt-1 text-base text-slate-900">{airport}</dd>
              </div>
            ) : null}
            {phone?.trim() ? (
              <div>
                <dt className="text-sm font-medium text-slate-500">Telephone</dt>
                <dd className="mt-1">
                  <a href={`tel:${phone}`} className="text-base font-medium text-slate-900 hover:underline">
                    {phone}
                  </a>
                </dd>
              </div>
            ) : null}
            {email?.trim() ? (
              <div>
                <dt className="text-sm font-medium text-slate-500">Email</dt>
                <dd className="mt-1">
                  <a href={`mailto:${email}`} className="text-base font-medium text-slate-900 hover:underline">
                    {email}
                  </a>
                </dd>
              </div>
            ) : null}
            {what3words?.trim() ? (
              <div>
                <dt className="text-sm font-medium text-slate-500">What3Words</dt>
                <dd className="mt-1 font-mono text-base text-slate-900">{what3words}</dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-8 flex flex-wrap gap-3">
            {mapsQuery ? (
              <a
                href={`https://maps.google.com/maps?q=${encodeURIComponent(mapsQuery)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center rounded-lg border border-slate-300 bg-white px-5 text-[15px] font-semibold text-slate-800 hover:bg-slate-50"
              >
                Open map
              </a>
            ) : null}
            <Link
              href="/directions"
              className="inline-flex h-12 items-center rounded-lg px-5 text-[15px] font-semibold"
              style={{
                backgroundColor: "var(--tenant-action, #1e40af)",
                color: "var(--tenant-action-fg, #fff)",
              }}
            >
              Directions
            </Link>
          </div>
        </div>

        {imageUrl ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={imageAlt || businessName || "Car park location"}
              width={900}
              height={700}
              className="h-full min-h-[280px] w-full object-cover"
              loading="lazy"
            />
          </div>
        ) : (
          <div
            className="flex min-h-[280px] flex-col justify-between rounded-2xl p-8 text-white sm:p-10"
            style={{
              background: `
                linear-gradient(145deg,
                  color-mix(in srgb, var(--tenant-primary, #1e40af) 92%, #0f172a),
                  #0f172a 70%)
              `,
            }}
          >
            <div>
              <MapPin className="h-8 w-8 text-white/80" aria-hidden />
              <p className="mt-5 text-2xl font-semibold tracking-tight">
                Find us easily
              </p>
              <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-white/80">
                Use the map pin{what3words?.trim() ? ", What3Words location," : ""} and
                directions page for a straightforward arrival.
              </p>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              {mapsQuery ? (
                <a
                  href={`https://maps.google.com/maps?q=${encodeURIComponent(mapsQuery)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-12 items-center rounded-lg bg-white px-5 text-[15px] font-semibold text-slate-900 hover:bg-slate-100"
                >
                  Open map
                </a>
              ) : null}
              <Link
                href="/directions"
                className="inline-flex h-12 items-center rounded-lg border border-white/35 px-5 text-[15px] font-semibold text-white hover:bg-white/10"
              >
                Full directions
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function ReviewsSection({
  heading,
  items,
  externalUrl,
}: {
  heading?: string;
  items: Array<{ author?: string; quote?: string; rating?: number }>;
  externalUrl?: string | null;
}) {
  const quotes = items.filter((i) => i.quote?.trim());
  if (!quotes.length) return null;
  return (
    <section className={`bg-white ${SECTION_Y}`}>
      <div className={SHELL}>
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-[2.125rem]">
            {heading || "What customers say"}
          </h2>
          {externalUrl ? (
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[15px] font-semibold text-slate-700 hover:underline"
            >
              More reviews
            </a>
          ) : null}
        </div>
        <ul className="mt-10 flex gap-5 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0">
          {quotes.slice(0, 3).map((r, i) => (
            <li
              key={i}
              className="min-w-[280px] flex-1 rounded-2xl border border-slate-200 bg-slate-50/80 p-6 sm:min-w-0"
            >
              <blockquote className="text-base leading-relaxed text-slate-700">
                “{r.quote}”
              </blockquote>
              {r.author ? (
                <footer className="mt-4 text-sm font-semibold text-slate-500">
                  — {r.author}
                </footer>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function FaqPreviewSection({
  heading,
  faqs,
}: {
  heading?: string;
  faqs: FaqItem[];
}) {
  if (!faqs.length) return null;
  return (
    <section id="faqs" className={`bg-white ${SECTION_Y}`}>
      <div className={`${SHELL} max-w-[900px]`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-[2.125rem]">
            {heading || "Frequently asked questions"}
          </h2>
          <Link
            href="/faq"
            className="text-[15px] font-semibold text-slate-700 hover:underline"
          >
            View all FAQs
          </Link>
        </div>
        <div className="mt-8 divide-y divide-slate-200 border-y border-slate-200">
          {faqs.slice(0, 6).map((f, i) => (
            <details key={i} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-semibold text-slate-900 marker:content-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 [&::-webkit-details-marker]:hidden sm:text-lg">
                {f.q}
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition group-open:rotate-45"
                  aria-hidden
                >
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-600 sm:text-base">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCtaSection({
  heading,
  body,
  ctaText,
  ctaHref,
}: {
  heading?: string;
  body?: string;
  ctaText?: string;
  ctaHref?: string;
}) {
  return (
    <section
      className={SECTION_Y}
      style={{
        background: `
          linear-gradient(120deg,
            var(--tenant-primary, #1e40af) 0%,
            color-mix(in srgb, var(--tenant-primary, #1e40af) 70%, #0f172a) 100%)
        `,
      }}
    >
      <div
        className={`${SHELL} flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center`}
      >
        <div className="max-w-2xl text-white">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-[2.25rem]">
            {heading || "Ready to book?"}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/85 sm:text-lg">
            {body || "Check availability and reserve your space online."}
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <a
            href={ctaHref || "/#booking"}
            className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-white px-6 text-[15px] font-semibold text-slate-900 hover:bg-slate-100 sm:w-auto"
          >
            {ctaText || "Book parking"}
          </a>
          <Link
            href="/directions"
            className="inline-flex h-12 w-full items-center justify-center rounded-lg border border-white/40 px-6 text-[15px] font-semibold text-white hover:bg-white/10 sm:w-auto"
          >
            Directions
          </Link>
        </div>
      </div>
    </section>
  );
}
