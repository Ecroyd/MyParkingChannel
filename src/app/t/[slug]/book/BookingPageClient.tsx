"use client";
import { useState, useEffect } from "react";
import BookingModal from "@/components/tenant/BookingModal";
import BookingModalBanner from "@/components/tenant/BookingModalBanner";

interface BookingPageClientProps {
  slug: string;
  bookingModalStyle?: 'card' | 'banner' | null;
}

export default function BookingPageClient({ slug, bookingModalStyle = 'card' }: BookingPageClientProps) {
  console.log("[BOOKING_PAGE_CLIENT] Received bookingModalStyle:", bookingModalStyle);
  
  const [bannerModalOpen, setBannerModalOpen] = useState(false);

  // If banner style is selected, open it automatically on mount
  useEffect(() => {
    console.log("[BOOKING_PAGE_CLIENT] useEffect - bookingModalStyle:", bookingModalStyle);
    if (bookingModalStyle === "banner") {
      console.log("[BOOKING_PAGE_CLIENT] Opening banner modal");
      setBannerModalOpen(true);
    }
  }, [bookingModalStyle]);

  console.log("[BOOKING_PAGE_CLIENT] Rendering decision - bookingModalStyle:", bookingModalStyle, "willRenderBanner:", bookingModalStyle === "banner");

  if (bookingModalStyle === "banner") {
    return (
      <BookingModalBanner 
        slug={slug} 
        open={bannerModalOpen} 
        onClose={() => setBannerModalOpen(false)} 
      />
    );
  }

  // Default card style
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
      <BookingModal slug={slug} />
    </div>
  );
}
