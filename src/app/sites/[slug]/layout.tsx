// src/app/sites/[slug]/layout.tsx
import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { getSiteContext } from "@/lib/site";
import { TenantIntegrations } from "@/components/site/TenantIntegrations";
import { createServerClient } from "@/lib/supabase/server";

const tenantFont = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-tenant",
});

export const dynamic = "force-dynamic";

const DEFAULT_FAVICON = "/favicon.png";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  const ctx = await getSiteContext(resolvedParams.slug);

  if (!ctx) {
    return {
      title: "Site unavailable",
      icons: { icon: DEFAULT_FAVICON },
    };
  }

  let settingsFavicon: string | null = null;
  if (ctx.site?.id) {
    try {
      const supabase = await createServerClient();
      const { data } = await supabase
        .from("site_seo_settings")
        .select("favicon_url, website_name")
        .eq("site_id", ctx.site.id)
        .maybeSingle();
      settingsFavicon = (data?.favicon_url as string | null) || null;
    } catch {
      /* ignore */
    }
  }

  const favicon =
    settingsFavicon?.trim() ||
    ctx.branding?.icon_192_url?.trim() ||
    DEFAULT_FAVICON;

  const title = ctx.branding?.app_name || ctx.tenant.name || "Airport Parking";
  return {
    title,
    description: "Secure airport parking. Simple booking. Close to the terminal.",
    icons: {
      icon: [{ url: favicon, type: "image/png" }],
      apple: [{ url: favicon, type: "image/png" }],
      shortcut: favicon,
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
    return { themeColor: "#0f172a" };
  }

  return {
    themeColor: ctx.tenant.brand_primary || ctx.branding?.theme_color || "#0f172a",
  };
}

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <div
      className={`${tenantFont.variable} ${tenantFont.className} tenant-site flex min-h-screen flex-col bg-[#f8fafc] text-slate-800 antialiased`}
    >
      <TenantIntegrations slug={slug} />
      {children}
    </div>
  );
}
