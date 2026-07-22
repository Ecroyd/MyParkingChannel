import {
  parseContentBlocks,
  type BenefitsBlock,
  type CallToActionBlock,
  type ContentBlock,
  type DirectionsBlock,
  type FaqBlock,
  type FaqItem,
  type HeroBlock,
  type HowItWorksBlock,
  type ReviewsBlock,
  faqItemsWithAnswers,
} from "@/lib/seo/content-blocks";
import type { SitePageRow, SiteSeoSettings } from "@/lib/seo/types";
import { hasUsableAddress as addressIsUsable } from "@/lib/seo/public-address";

export type PresentationJson = {
  footerDescription?: string;
  sections?: {
    trustStrip?: boolean;
    howItWorks?: boolean;
    benefits?: boolean;
    location?: boolean;
    reviews?: boolean;
    faq?: boolean;
    finalCta?: boolean;
  };
  heroEyebrow?: string;
  heroImageUrl?: string;
  heroImageAlt?: string;
  trustPoints?: string[];
  /** Durable Google reviews display config only — never review bodies. */
  googleReviews?: Record<string, unknown>;
};

export type HomepageModel = {
  h1: string;
  subtitle: string;
  eyebrow: string | null;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  trustPoints: string[];
  howItWorks: HowItWorksBlock | null;
  benefits: BenefitsBlock | null;
  locationBlock: DirectionsBlock | null;
  reviews: ReviewsBlock | null;
  faqs: FaqItem[];
  finalCta: CallToActionBlock | null;
  footerDescription: string | null;
  sections: Required<NonNullable<PresentationJson["sections"]>>;
};

const DEFAULT_SECTIONS = {
  trustStrip: true,
  howItWorks: true,
  benefits: true,
  location: true,
  reviews: true,
  faq: true,
  finalCta: true,
};

/** Neutral fallbacks — never tenant-specific places. Prefer business-name fallback below. */
export const FALLBACK_H1 = "Airport parking made simple";
export const FALLBACK_SUBTITLE =
  "Secure parking, straightforward pricing and an easy arrival experience.";

export function fallbackH1WithBusinessName(businessName?: string | null): string {
  const name = businessName?.trim();
  if (name) return `Secure Airport Parking with ${name}`;
  return FALLBACK_H1;
}
export const FALLBACK_TRUST_POINTS = [
  "Secure onsite parking",
  "Straightforward arrivals",
  "Book directly online",
];

export const FALLBACK_HOW_IT_WORKS: HowItWorksBlock = {
  id: "fallback-how",
  type: "how_it_works",
  heading: "How it works",
  steps: [
    { title: "Book online", body: "Choose your dates and complete your booking." },
    { title: "Arrive and park", body: "Follow the directions to the car park on the day." },
    { title: "Continue to the terminal", body: "Continue with your journey after parking." },
  ],
};

function asPresentation(raw: unknown): PresentationJson {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as PresentationJson;
}

function findBlock<T extends ContentBlock["type"]>(
  blocks: ContentBlock[],
  type: T
): Extract<ContentBlock, { type: T }> | null {
  return (blocks.find((b) => b.type === type) as Extract<ContentBlock, { type: T }> | undefined) ?? null;
}

/**
 * Build homepage presentation from tenant page blocks + settings + profile.
 * Missing optional data yields null/empty — callers must hide empty sections.
 */
export function buildHomepageModel(args: {
  page: SitePageRow | null;
  settings: SiteSeoSettings | null;
  profile: Record<string, unknown> | null;
  tenantHeroTitle?: string | null;
  tenantHeroSubtitle?: string | null;
}): HomepageModel {
  const blocks = parseContentBlocks(args.page?.content_json);
  const presentation = asPresentation(args.settings?.presentation_json);
  const hero = findBlock(blocks, "hero") as HeroBlock | null;
  const how = findBlock(blocks, "how_it_works") as HowItWorksBlock | null;
  const benefits = findBlock(blocks, "benefits") as BenefitsBlock | null;
  const security = findBlock(blocks, "security");
  const locationBlock = findBlock(blocks, "directions") as DirectionsBlock | null;
  const reviews = findBlock(blocks, "reviews") as ReviewsBlock | null;
  const faqBlock = findBlock(blocks, "faq") as FaqBlock | null;
  const finalCta = findBlock(blocks, "call_to_action") as CallToActionBlock | null;

  const featureItems =
    Array.isArray(args.profile?.features) && args.profile!.features.length
      ? (args.profile!.features as string[])
          .filter((f) => typeof f === "string" && f.trim())
          .map((title) => ({ title }))
      : [];

  const benefitsResolved: BenefitsBlock | null =
    benefits && benefits.items && benefits.items.length
      ? benefits
      : security && "items" in security && security.items?.length
        ? {
            id: security.id,
            type: "benefits",
            heading: security.heading || "Why choose us",
            items: security.items,
          }
        : featureItems.length
          ? {
              id: "features-as-benefits",
              type: "benefits",
              heading: "Why choose us",
              items: featureItems,
            }
          : null;

  const trustPoints =
    (hero?.trustPoints && hero.trustPoints.length ? hero.trustPoints : null) ||
    (presentation.trustPoints && presentation.trustPoints.length
      ? presentation.trustPoints
      : null) ||
    (featureItems.length ? featureItems.slice(0, 4).map((f) => f.title) : null) ||
    FALLBACK_TRUST_POINTS;

  const businessName =
    (typeof args.profile?.business_name === "string" && args.profile.business_name.trim()) ||
    args.settings?.website_name?.trim() ||
    null;

  const h1 =
    args.page?.h1?.trim() ||
    hero?.title?.trim() ||
    args.tenantHeroTitle?.trim() ||
    fallbackH1WithBusinessName(businessName);

  const subtitle =
    args.page?.excerpt?.trim() ||
    hero?.subtitle?.trim() ||
    args.tenantHeroSubtitle?.trim() ||
    (typeof args.profile?.short_tagline === "string" && args.profile.short_tagline.trim()) ||
    (typeof args.profile?.business_description === "string" &&
      args.profile.business_description.trim()) ||
    FALLBACK_SUBTITLE;

  const faqs = faqItemsWithAnswers(
    faqBlock ? [faqBlock] : [],
    args.profile?.faq
  ).slice(0, 6);

  // Only show reviews when real testimonial items exist — never invent from aggregate counts
  const reviewsResolved =
    reviews && Array.isArray(reviews.items) && reviews.items.some((i) => i.quote?.trim())
      ? reviews
      : null;

  const sections = {
    ...DEFAULT_SECTIONS,
    ...(presentation.sections || {}),
  };

  const footerDescription =
    presentation.footerDescription?.trim() ||
    (typeof args.profile?.business_description === "string"
      ? args.profile.business_description.trim()
      : null) ||
    (typeof args.profile?.about_text === "string" ? args.profile.about_text.trim() : null) ||
    null;

  return {
    h1,
    subtitle,
    eyebrow:
      hero?.eyebrow?.trim() ||
      presentation.heroEyebrow?.trim() ||
      null,
    heroImageUrl:
      hero?.imageUrl?.trim() ||
      presentation.heroImageUrl?.trim() ||
      null,
    heroImageAlt:
      hero?.imageAlt?.trim() ||
      presentation.heroImageAlt?.trim() ||
      null,
    trustPoints: trustPoints.slice(0, 4),
    howItWorks: how && how.steps?.length ? how : FALLBACK_HOW_IT_WORKS,
    benefits: benefitsResolved,
    locationBlock,
    reviews: reviewsResolved,
    faqs,
    finalCta: finalCta,
    footerDescription,
    sections,
  };
}

export function hasUsableAddress(address: unknown): boolean {
  return addressIsUsable(address);
}
