import type { Metadata } from "next";
import { generateTenantPageMetadata } from "@/lib/seo/page-render";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  return generateTenantPageMetadata({
    slug: resolvedParams.slug,
    path: "/manage-booking",
    pageKey: "manage_booking",
  });
}

export default function ManageBookingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
