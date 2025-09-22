import { notFound } from "next/navigation";
import { getTenantContext } from "@/lib/site";
import BookingWidget from "@/components/booking/BookingWidget";

interface WidgetPageProps {
  params: Promise<{ slug: string }>;
}

export default async function WidgetPage({ params }: WidgetPageProps) {
  const resolvedParams = await params;
  const { slug } = resolvedParams;

  const ctx = await getTenantContext(slug);
  if (!ctx) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">
        <BookingWidget 
          tenantSlug={slug} 
          tenantId={ctx.tenant.id} 
        />
      </div>
    </div>
  );
}