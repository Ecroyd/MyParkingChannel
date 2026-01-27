"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import BookingModal from "@/components/tenant/BookingModal";
import BookingModalBanner from "@/components/tenant/BookingModalBanner";

export default function BookingPageClient({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const modalStyle = searchParams.get("modal") || "card"; // "card" or "banner"
  const [bannerModalOpen, setBannerModalOpen] = useState(false);

  // If banner style is selected, open it automatically on mount
  useEffect(() => {
    if (modalStyle === "banner") {
      setBannerModalOpen(true);
    }
  }, [modalStyle]);

  if (modalStyle === "banner") {
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
