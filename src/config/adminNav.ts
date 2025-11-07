// src/config/adminNav.ts
export type NavNode = {
  key: string;
  label: string;
  href?: string;       // if missing, treat as a section/node only
  feature?: string;    // optional feature flag (SaaS), e.g. "integrations"
  children?: NavNode[];
  section?: string;    // explicit section title for top-level grouping
};

/** Single source of truth for Admin navigation */
export const ADMIN_NAV: NavNode[] = [
  // ——— Core ———
  { key: "dashboard", label: "Dashboard", href: "/admin/dashboard-server", section: "Core" },
  { key: "today", label: "Today", href: "/admin/today-server", section: "Core" },
  {
    key: "bookings",
    label: "Bookings",
    href: "/admin/bookings-server",
    section: "Core",
    children: [
      { key: "bookings-upload", label: "Import Data", href: "/admin/bookings/upload" },
    ],
  },
  { key: "booking-rules", label: "Booking Rules", href: "/admin/booking-rules", section: "Core" },
  { key: "pricing", label: "Pricing", href: "/admin/pricing", section: "Core" },
  { key: "analytics", label: "Analytics", href: "/admin/analytics", section: "Core" },

  // ——— Sites & Integrations ———
  { key: "tenant-sites", label: "Tenant Sites", href: "/admin/tenant-sites-server", section: "Sites & Integrations" },
  { key: "site-seo", label: "Site & SEO", href: "/admin/site-seo", section: "Sites & Integrations" },
  { key: "integrations-flights", label: "Flight Data", href: "/admin/integrations/flights", section: "Sites & Integrations" },
  { 
    key: "integrations", 
    label: "Integrations", 
    href: "/admin/integrations", 
    section: "Sites & Integrations", 
    feature: "integrations",
  },
  { key: "devices", label: "Gate Devices", href: "/admin/devices", section: "Sites & Integrations", feature: "devices" },

      // ——— Platform Management (Admin Only) ———
      { key: "applications", label: "Applications", href: "/admin/applications", section: "Platform Management", feature: "platform_admin" },
      { key: "tenants", label: "Tenants", href: "/admin/tenants", section: "Platform Management", feature: "platform_admin" },
      { key: "tenants-new", label: "Add Tenant", href: "/admin/tenants/new", section: "Platform Management", feature: "platform_admin" },

  // ——— Settings ———
  {
    key: "settings",
    label: "Settings",
    href: "/admin/settings",
    section: "Settings",
    children: [
      { key: "capacity", label: "Capacity", href: "/admin/settings/capacity" },
      { key: "pwa", label: "PWA Settings", href: "/admin/pwa-settings" },
      { key: "setup", label: "Initial Setup", href: "/admin/setup" },
    ],
  },
  { key: "payments", label: "Payments", href: "/admin/payments", section: "Settings" },
];


