// src/app/sites/[slug]/layout.tsx
import type { Metadata, Viewport } from "next";
import { getSiteContext } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  const ctx = await getSiteContext(resolvedParams.slug);

  if (!ctx) {
    return { title: "Site unavailable" };
  }

  const title = ctx.branding?.app_name || ctx.tenant.name || "Airport Parking";
  return {
    title,
    description: "Secure airport parking. Simple booking. Close to the terminal.",
    icons: {
      icon: ctx.branding?.icon_192_url || "/icons/car logo.png",
      apple: ctx.branding?.icon_192_url || "/icons/car logo.png",
    },
  };
}

export async function generateViewport({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Viewport> {
  const resolvedParams = await params;
  const ctx = await getSiteContext(resolvedParams.slug);

  if (!ctx) {
    return { themeColor: "#0ea5e9" };
  }

  return {
    themeColor: ctx.branding?.theme_color || "#0ea5e9",
  };
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-glass-gradient text-slate-800">
      {children}
    </div>
  );
}
