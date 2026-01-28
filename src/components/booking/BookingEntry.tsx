"use client";

import BookingWidget from "./BookingWidget";
import BookingPageClient from "@/app/t/[slug]/book/BookingPageClient";

type SiteLike = {
  booking_modal_style?: string | null;
};

interface BookingEntryProps {
  slug: string;
  tenantId: string;
  site: SiteLike | null;
}

export default function BookingEntry({ slug, tenantId, site }: BookingEntryProps) {
  const style = (site?.booking_modal_style ?? "card").toLowerCase();

  console.log("[BOOKING_ENTRY] resolved style", style, "for slug", slug);

  if (style === "banner") {
    return (
      <BookingPageClient
        slug={slug}
        bookingModalStyle="banner"
      />
    );
  }

  return (
    <BookingWidget
      tenantSlug={slug}
      tenantId={tenantId}
    />
  );
}

