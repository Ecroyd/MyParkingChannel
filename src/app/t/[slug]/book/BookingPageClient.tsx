"use client";
import { useState, useEffect } from "react";
import BookingModal from "@/components/tenant/BookingModal";
import BookingModalBanner from "@/components/tenant/BookingModalBanner";

interface BookingPageClientProps {
  slug: string;
  bookingModalStyle?: 'card' | 'banner' | null;
}

export default function BookingPageClient({ slug, bookingModalStyle = 'card' }: BookingPageClientProps) {
  const [bannerModalOpen, setBannerModalOpen] = useState(false);

  // If banner style is selected, open it automatically on mount
  useEffect(() => {
    if (bookingModalStyle === "banner") {
      setBannerModalOpen(true);
    }
  }, [bookingModalStyle]);

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
