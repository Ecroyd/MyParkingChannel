/**
 * Validated content block schema for tenant website pages.
 * Unknown / malformed blocks fail safely and never crash the public site.
 */

export const CONTENT_BLOCK_TYPES = [
  "hero",
  "booking_search",
  "rich_text",
  "benefits",
  "how_it_works",
  "security",
  "terminal_distance",
  "arrival_procedure",
  "return_procedure",
  "directions",
  "hotel_parking",
  "reviews",
  "faq",
  "gallery",
  "contact",
  "call_to_action",
] as const;

export type ContentBlockType = (typeof CONTENT_BLOCK_TYPES)[number];

export type ContentBlockBase = {
  id: string;
  type: ContentBlockType;
  enabled?: boolean;
};

export type HeroBlock = ContentBlockBase & {
  type: "hero";
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  imageUrl?: string;
  imageAlt?: string;
  ctaText?: string;
  ctaHref?: string;
  /** Short trust points shown under the hero subtitle (3–4). */
  trustPoints?: string[];
};

export type BookingSearchBlock = ContentBlockBase & {
  type: "booking_search";
  heading?: string;
};

export type RichTextBlock = ContentBlockBase & {
  type: "rich_text";
  heading?: string;
  body?: string;
};

export type ListItem = { title: string; body?: string; icon?: string };

export type BenefitsBlock = ContentBlockBase & {
  type: "benefits";
  heading?: string;
  items?: ListItem[];
};

export type HowItWorksBlock = ContentBlockBase & {
  type: "how_it_works";
  heading?: string;
  steps?: ListItem[];
};

export type SecurityBlock = ContentBlockBase & {
  type: "security";
  heading?: string;
  body?: string;
  items?: ListItem[];
};

export type TerminalDistanceBlock = ContentBlockBase & {
  type: "terminal_distance";
  heading?: string;
  body?: string;
};

export type ProcedureBlock = ContentBlockBase & {
  type: "arrival_procedure" | "return_procedure";
  heading?: string;
  steps?: ListItem[];
  body?: string;
};

export type DirectionsBlock = ContentBlockBase & {
  type: "directions";
  heading?: string;
  body?: string;
  mapEnabled?: boolean;
};

export type HotelParkingBlock = ContentBlockBase & {
  type: "hotel_parking";
  heading?: string;
  body?: string;
};

export type ReviewsBlock = ContentBlockBase & {
  type: "reviews";
  heading?: string;
  /** Only render ratings when explicitly provided by tenant data — never invent. */
  items?: Array<{ author?: string; quote?: string; rating?: number }>;
};

export type FaqItem = { q: string; a: string };

export type FaqBlock = ContentBlockBase & {
  type: "faq";
  heading?: string;
  items?: FaqItem[];
};

export type GalleryBlock = ContentBlockBase & {
  type: "gallery";
  heading?: string;
  images?: Array<{ url: string; alt?: string }>;
};

export type ContactBlock = ContentBlockBase & {
  type: "contact";
  heading?: string;
  showPhone?: boolean;
  showEmail?: boolean;
  showAddress?: boolean;
  showHours?: boolean;
};

export type CallToActionBlock = ContentBlockBase & {
  type: "call_to_action";
  heading?: string;
  body?: string;
  ctaText?: string;
  ctaHref?: string;
};

export type ContentBlock =
  | HeroBlock
  | BookingSearchBlock
  | RichTextBlock
  | BenefitsBlock
  | HowItWorksBlock
  | SecurityBlock
  | TerminalDistanceBlock
  | ProcedureBlock
  | DirectionsBlock
  | HotelParkingBlock
  | ReviewsBlock
  | FaqBlock
  | GalleryBlock
  | ContactBlock
  | CallToActionBlock;

const BLOCK_TYPE_SET = new Set<string>(CONTENT_BLOCK_TYPES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asBool(value: unknown, fallback = true): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asListItems(value: unknown): ListItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: ListItem[] = [];
  for (const raw of value) {
    if (!isRecord(raw) || typeof raw.title !== "string" || !raw.title.trim()) continue;
    items.push({
      title: raw.title,
      body: asString(raw.body),
      icon: asString(raw.icon),
    });
  }
  return items;
}

function asFaqItems(value: unknown): FaqItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: FaqItem[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const q = asString(raw.q) ?? asString(raw.question);
    const a = asString(raw.a) ?? asString(raw.answer);
    if (!q?.trim()) continue;
    items.push({ q: q.trim(), a: (a ?? "").trim() });
  }
  return items;
}

/** Parse a single block; returns null if type unknown or structure unusable. */
export function parseContentBlock(raw: unknown, index = 0): ContentBlock | null {
  if (!isRecord(raw)) return null;
  const type = asString(raw.type);
  if (!type || !BLOCK_TYPE_SET.has(type)) return null;

  const id = asString(raw.id) || `${type}-${index}`;
  const enabled = asBool(raw.enabled, true);
  const base = { id, enabled };

  switch (type as ContentBlockType) {
    case "hero":
      return {
        ...base,
        type: "hero",
        title: asString(raw.title),
        subtitle: asString(raw.subtitle),
        eyebrow: asString(raw.eyebrow),
        imageUrl: asString(raw.imageUrl) ?? asString(raw.image_url),
        imageAlt: asString(raw.imageAlt) ?? asString(raw.image_alt),
        ctaText: asString(raw.ctaText) ?? asString(raw.cta_text),
        ctaHref: asString(raw.ctaHref) ?? asString(raw.cta_href),
        trustPoints: Array.isArray(raw.trustPoints)
          ? raw.trustPoints.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
          : Array.isArray(raw.trust_points)
            ? raw.trust_points.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
            : undefined,
      };
    case "booking_search":
      return { ...base, type: "booking_search", heading: asString(raw.heading) };
    case "rich_text":
      return {
        ...base,
        type: "rich_text",
        heading: asString(raw.heading),
        body: asString(raw.body),
      };
    case "benefits":
      return {
        ...base,
        type: "benefits",
        heading: asString(raw.heading),
        items: asListItems(raw.items),
      };
    case "how_it_works":
      return {
        ...base,
        type: "how_it_works",
        heading: asString(raw.heading),
        steps: asListItems(raw.steps ?? raw.items),
      };
    case "security":
      return {
        ...base,
        type: "security",
        heading: asString(raw.heading),
        body: asString(raw.body),
        items: asListItems(raw.items),
      };
    case "terminal_distance":
      return {
        ...base,
        type: "terminal_distance",
        heading: asString(raw.heading),
        body: asString(raw.body),
      };
    case "arrival_procedure":
    case "return_procedure":
      return {
        ...base,
        type: type as "arrival_procedure" | "return_procedure",
        heading: asString(raw.heading),
        body: asString(raw.body),
        steps: asListItems(raw.steps ?? raw.items),
      };
    case "directions":
      return {
        ...base,
        type: "directions",
        heading: asString(raw.heading),
        body: asString(raw.body),
        mapEnabled: asBool(raw.mapEnabled ?? raw.map_enabled, true),
      };
    case "hotel_parking":
      return {
        ...base,
        type: "hotel_parking",
        heading: asString(raw.heading),
        body: asString(raw.body),
      };
    case "reviews": {
      const items: ReviewsBlock["items"] = [];
      if (Array.isArray(raw.items)) {
        for (const r of raw.items) {
          if (!isRecord(r)) continue;
          items.push({
            author: asString(r.author),
            quote: asString(r.quote),
            rating: typeof r.rating === "number" ? r.rating : undefined,
          });
        }
      }
      return { ...base, type: "reviews", heading: asString(raw.heading), items };
    }
    case "faq":
      return {
        ...base,
        type: "faq",
        heading: asString(raw.heading),
        items: asFaqItems(raw.items),
      };
    case "gallery": {
      const images: Array<{ url: string; alt?: string }> = [];
      if (Array.isArray(raw.images)) {
        for (const img of raw.images) {
          if (!isRecord(img)) continue;
          const url = asString(img.url);
          if (!url) continue;
          images.push({ url, alt: asString(img.alt) });
        }
      }
      return { ...base, type: "gallery", heading: asString(raw.heading), images };
    }
    case "contact":
      return {
        ...base,
        type: "contact",
        heading: asString(raw.heading),
        showPhone: asBool(raw.showPhone ?? raw.show_phone, true),
        showEmail: asBool(raw.showEmail ?? raw.show_email, true),
        showAddress: asBool(raw.showAddress ?? raw.show_address, true),
        showHours: asBool(raw.showHours ?? raw.show_hours, true),
      };
    case "call_to_action":
      return {
        ...base,
        type: "call_to_action",
        heading: asString(raw.heading),
        body: asString(raw.body),
        ctaText: asString(raw.ctaText) ?? asString(raw.cta_text),
        ctaHref: asString(raw.ctaHref) ?? asString(raw.cta_href),
      };
    default:
      return null;
  }
}

/**
 * Parse content_json safely. Invalid entries are skipped — never throws.
 */
export function parseContentBlocks(raw: unknown): ContentBlock[] {
  if (raw == null) return [];
  let arr: unknown[] = [];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      arr = Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  } else if (Array.isArray(raw)) {
    arr = raw;
  } else {
    return [];
  }

  const blocks: ContentBlock[] = [];
  arr.forEach((item, i) => {
    const block = parseContentBlock(item, i);
    if (block && block.enabled !== false) blocks.push(block);
  });
  return blocks;
}

/** FAQ items that have a non-empty answer (required for FAQPage JSON-LD). */
export function faqItemsWithAnswers(blocks: ContentBlock[], profileFaq?: unknown): FaqItem[] {
  const fromBlocks: FaqItem[] = [];
  for (const b of blocks) {
    if (b.type !== "faq" || !b.items) continue;
    for (const item of b.items) {
      if (item.q.trim() && item.a.trim()) fromBlocks.push(item);
    }
  }
  if (fromBlocks.length) return fromBlocks;

  if (!Array.isArray(profileFaq)) return [];
  const fromProfile: FaqItem[] = [];
  for (const raw of profileFaq) {
    if (!isRecord(raw)) continue;
    const q = asString(raw.q) ?? asString(raw.question);
    const a = asString(raw.a) ?? asString(raw.answer);
    if (q?.trim() && a?.trim()) fromProfile.push({ q: q.trim(), a: a.trim() });
  }
  return fromProfile;
}

export function visibleTextLength(blocks: ContentBlock[]): number {
  let n = 0;
  for (const b of blocks) {
    const parts: Array<string | undefined> = [];
    if ("heading" in b) parts.push(b.heading);
    if ("title" in b) parts.push((b as HeroBlock).title);
    if ("subtitle" in b) parts.push((b as HeroBlock).subtitle);
    if ("body" in b) parts.push((b as RichTextBlock).body);
    if ("items" in b && Array.isArray((b as BenefitsBlock).items)) {
      for (const it of (b as BenefitsBlock).items ?? []) {
        parts.push(it.title, it.body);
      }
    }
    if ("steps" in b && Array.isArray((b as HowItWorksBlock).steps)) {
      for (const it of (b as HowItWorksBlock).steps ?? []) {
        parts.push(it.title, it.body);
      }
    }
    n += parts.filter(Boolean).join(" ").length;
  }
  return n;
}
