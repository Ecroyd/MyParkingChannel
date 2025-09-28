import type { Metadata } from "next";
import { getTenantContext } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  const title = ctx?.branding?.app_name || ctx?.tenant?.name || "Parking";
  return { title, description: "Secure airport parking. Simple booking." };
}

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-glass-gradient text-slate-800">{children}</div>;
}
