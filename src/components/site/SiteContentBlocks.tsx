import { parseContentBlocks, type ContentBlock, type ContentBlockType } from "@/lib/seo/content-blocks";
import Link from "next/link";

type ProfileBits = {
  phone?: string | null;
  email?: string | null;
  address?: Record<string, unknown> | null;
  hours?: Array<{ day?: string; open?: string; close?: string }> | null;
  what3words?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

function formatAddress(address: Record<string, unknown> | null | undefined): string {
  if (!address) return "";
  return [
    address.street || address.streetAddress,
    address.city || address.addressLocality,
    address.county || address.addressRegion,
    address.postalCode,
    address.country || address.addressCountry,
  ]
    .filter(Boolean)
    .join(", ");
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
      {children}
    </h2>
  );
}

function BlockView({
  block,
  profile,
}: {
  block: ContentBlock;
  profile?: ProfileBits | null;
}) {
  switch (block.type) {
    case "hero":
      return (
        <section className="space-y-3">
          {block.title ? <SectionHeading>{block.title}</SectionHeading> : null}
          {block.subtitle ? (
            <p className="max-w-2xl text-base leading-relaxed text-slate-600">
              {block.subtitle}
            </p>
          ) : null}
          {block.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={block.imageUrl}
              alt={block.imageAlt || ""}
              className="mt-4 max-h-80 w-full rounded-xl object-cover"
            />
          ) : null}
          {block.ctaText && block.ctaHref ? (
            <Link
              href={block.ctaHref}
              className="mt-2 inline-flex rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              {block.ctaText}
            </Link>
          ) : null}
        </section>
      );
    case "booking_search":
      return null;
    case "rich_text":
    case "terminal_distance":
    case "hotel_parking":
      return (
        <section className="max-w-3xl space-y-3">
          {block.heading ? <SectionHeading>{block.heading}</SectionHeading> : null}
          {block.body ? (
            <div className="whitespace-pre-wrap text-base leading-relaxed text-slate-600">
              {block.body}
            </div>
          ) : null}
        </section>
      );
    case "benefits":
    case "security":
      return (
        <section className="space-y-5">
          {block.heading ? <SectionHeading>{block.heading}</SectionHeading> : null}
          {"body" in block && block.body ? (
            <p className="max-w-3xl text-base leading-relaxed text-slate-600">{block.body}</p>
          ) : null}
          <ul className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {(block.items ?? []).map((item, i) => (
              <li key={i} className="border-t border-slate-200 pt-4">
                <p className="font-medium text-slate-900">{item.title}</p>
                {item.body ? (
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.body}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      );
    case "how_it_works":
    case "arrival_procedure":
    case "return_procedure":
      return (
        <section className="space-y-5">
          {block.heading ? <SectionHeading>{block.heading}</SectionHeading> : null}
          {"body" in block && block.body ? (
            <p className="max-w-3xl text-base leading-relaxed text-slate-600">{block.body}</p>
          ) : null}
          <ol className="space-y-4">
            {((block as { steps?: Array<{ title: string; body?: string }> }).steps ?? []).map(
              (step, i) => (
                <li key={i} className="flex gap-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium text-slate-900">{step.title}</p>
                    {step.body ? (
                      <p className="mt-1 text-sm leading-relaxed text-slate-600">{step.body}</p>
                    ) : null}
                  </div>
                </li>
              )
            )}
          </ol>
        </section>
      );
    case "directions":
      return (
        <section className="max-w-3xl space-y-3">
          {block.heading ? <SectionHeading>{block.heading}</SectionHeading> : null}
          {block.body ? (
            <div className="whitespace-pre-wrap text-base leading-relaxed text-slate-600">
              {block.body}
            </div>
          ) : null}
          {profile?.what3words ? (
            <p className="text-sm text-slate-500">
              What3Words: <span className="font-mono text-slate-700">{profile.what3words}</span>
            </p>
          ) : null}
        </section>
      );
    case "faq":
      return (
        <section className="space-y-4">
          {block.heading ? <SectionHeading>{block.heading}</SectionHeading> : null}
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {(block.items ?? [])
              .filter((f) => f.q.trim())
              .map((f, i) => (
                <details key={i} className="group py-4">
                  <summary className="cursor-pointer list-none font-medium text-slate-900 marker:content-none [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center justify-between gap-4">
                      {f.q}
                      <span className="text-slate-400 transition group-open:rotate-45">+</span>
                    </span>
                  </summary>
                  {f.a ? (
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                      {f.a}
                    </p>
                  ) : null}
                </details>
              ))}
          </div>
        </section>
      );
    case "gallery":
      return (
        <section className="space-y-4">
          {block.heading ? <SectionHeading>{block.heading}</SectionHeading> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {(block.images ?? []).map((img, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={img.url}
                alt={img.alt || ""}
                className="h-48 w-full rounded-lg object-cover"
              />
            ))}
          </div>
        </section>
      );
    case "contact": {
      const address = formatAddress(profile?.address);
      return (
        <section className="max-w-xl space-y-4">
          {block.heading ? <SectionHeading>{block.heading}</SectionHeading> : null}
          <dl className="space-y-3 text-sm">
            {block.showPhone !== false && profile?.phone ? (
              <div>
                <dt className="text-slate-500">Phone</dt>
                <dd>
                  <a href={`tel:${profile.phone}`} className="tenant-link font-medium">
                    {profile.phone}
                  </a>
                </dd>
              </div>
            ) : null}
            {block.showEmail !== false && profile?.email ? (
              <div>
                <dt className="text-slate-500">Email</dt>
                <dd>
                  <a href={`mailto:${profile.email}`} className="tenant-link font-medium">
                    {profile.email}
                  </a>
                </dd>
              </div>
            ) : null}
            {block.showAddress !== false && address ? (
              <div>
                <dt className="text-slate-500">Address</dt>
                <dd className="text-slate-800">{address}</dd>
              </div>
            ) : null}
            {block.showHours !== false &&
            Array.isArray(profile?.hours) &&
            profile!.hours!.length ? (
              <div>
                <dt className="text-slate-500">Opening hours</dt>
                <dd>
                  <ul className="mt-1 space-y-1 text-slate-800">
                    {profile!.hours!.map((h, i) => (
                      <li key={i}>
                        {h.day}: {h.open} – {h.close}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      );
    }
    case "call_to_action":
      return (
        <section className="flex flex-col items-start gap-3 border-y border-slate-200 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl space-y-1">
            {block.heading ? (
              <h2 className="text-lg font-semibold text-slate-900">{block.heading}</h2>
            ) : null}
            {block.body ? <p className="text-sm text-slate-600">{block.body}</p> : null}
          </div>
          {block.ctaText && block.ctaHref ? (
            <Link
              href={block.ctaHref}
              className="inline-flex shrink-0 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              {block.ctaText}
            </Link>
          ) : null}
        </section>
      );
    case "reviews":
      if (!block.items?.length) return null;
      return (
        <section className="space-y-4">
          {block.heading ? <SectionHeading>{block.heading}</SectionHeading> : null}
          <div className="space-y-4">
            {block.items.map((r, i) => (
              <blockquote
                key={i}
                className="border-l-2 border-slate-300 pl-4 text-slate-700"
              >
                {r.quote ? <p className="leading-relaxed">“{r.quote}”</p> : null}
                {r.author ? (
                  <footer className="mt-2 text-sm text-slate-500">— {r.author}</footer>
                ) : null}
              </blockquote>
            ))}
          </div>
        </section>
      );
    default:
      return null;
  }
}

/**
 * Safely render content_json blocks. Malformed blocks are skipped.
 */
export function SiteContentBlocks({
  contentJson,
  profile,
  className,
  omitTypes,
}: {
  contentJson: unknown;
  profile?: ProfileBits | null;
  className?: string;
  omitTypes?: ContentBlockType[];
}) {
  const omit = new Set(omitTypes ?? []);
  const blocks = parseContentBlocks(contentJson).filter((b) => !omit.has(b.type));
  if (!blocks.length) return null;
  return (
    <div className={className ?? "space-y-12"}>
      {blocks.map((block) => (
        <BlockView key={block.id} block={block} profile={profile} />
      ))}
    </div>
  );
}
