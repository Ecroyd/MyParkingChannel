import { getTenantContext } from "@/lib/site";
import { Header, Footer } from "../_components/Chrome";
import BookingModal from "@/components/tenant/BookingModal";

export const dynamic = "force-dynamic";

export default async function BookPage({ params }: { params: { slug: string } }) {
  const ctx = await getTenantContext(params.slug);
  if (!ctx) return <main className="max-w-xl mx-auto py-24 px-4">Unknown tenant.</main>;

  const title = ctx.branding?.app_name || ctx.tenant.name || "Airport Parking";
  return (
    <>
      <Header title={title} slug={params.slug} />
      <main className="max-w-6xl mx-auto px-4 py-10">
        <h1 className="text-2xl md:text-3xl font-semibold mb-4">Book airport parking</h1>
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
          <BookingModal slug={params.slug} />
        </div>
      </main>
      <Footer title={title} />
    </>
  );
}
