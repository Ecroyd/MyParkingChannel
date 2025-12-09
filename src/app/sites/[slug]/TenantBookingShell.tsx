// src/app/sites/[slug]/TenantBookingShell.tsx
import React from "react";
import { getTenantContext } from "@/lib/site";
import BookingWidget from "@/components/booking/BookingWidget";

type Props = {
  slug: string;
  embedded?: boolean;
};

export default async function TenantBookingShell({ slug, embedded }: Props) {
  const ctx = await getTenantContext(slug);

  if (!ctx) {
    return (
      <div className="p-4 text-center text-gray-600">
        <p>Tenant not found or not published.</p>
      </div>
    );
  }

  return (
    <div className={embedded ? "min-h-[460px]" : "min-h-screen"}>
      <BookingWidget tenantSlug={slug} tenantId={ctx.tenant.id} />
    </div>
  );
}

