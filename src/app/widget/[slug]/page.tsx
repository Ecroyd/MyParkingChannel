// src/app/widget/[slug]/page.tsx
import TenantBookingShell from "@/app/sites/[slug]/TenantBookingShell";
import { getTenantContext } from "@/lib/site";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function TenantWidgetPage({ params, searchParams }: Props) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const embedded = resolvedSearchParams.embedded === "1" || resolvedSearchParams.embedded === "true";

  // Check if tenant exists and is published before rendering
  const ctx = await getTenantContext(resolvedParams.slug);
  if (!ctx) {
    notFound();
  }

  return (
    <div className="bg-slate-50 min-h-screen p-4">
      <div className="max-w-md mx-auto">
        <TenantBookingShell slug={resolvedParams.slug} embedded={embedded || true} />
      </div>
    </div>
  );
}
