import Link from "next/link";
import { getTenantContext } from "@/lib/site";
import { Header, Footer } from "./_components/Chrome";

export const dynamic = "force-dynamic";

export default async function TenantHome({ params }: { params: { slug: string } }) {
  const ctx = await getTenantContext(params.slug);
  if (!ctx) return <main className="max-w-xl mx-auto py-24 px-4">Unknown tenant.</main>;

  const title = ctx.branding?.app_name || ctx.tenant.name || "Airport Parking";
  const heroTitle = ctx.tenant.site_hero_title || "Airport Parking, made simple.";
  const heroSubtitle = ctx.tenant.site_hero_subtitle || "Secure parking, clear pricing, easy check-in.";

  return (
    <>
      <Header title={title} slug={params.slug} />
      <main className="max-w-6xl mx-auto px-4 pt-14 pb-10 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight leading-tight">
            {heroTitle} <span className="text-sky-600">Close to the terminal.</span>
          </h1>
          <p className="mt-4 text-slate-600 max-w-prose">{heroSubtitle}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/t/${params.slug}/book`} className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white px-5 py-3 rounded-2xl shadow">
              Book parking
            </Link>
            <Link href={`/t/${params.slug}/contact`} className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl border border-slate-300 hover:border-slate-400">
              Contact
            </Link>
          </div>
        </div>
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-semibold text-lg mb-3">Quick quote</h2>
          <p className="text-slate-600 text-sm">Open the Book page to get a live quote and continue to checkout.</p>
        </div>
      </main>
      <Footer title={title} />
    </>
  );
}
