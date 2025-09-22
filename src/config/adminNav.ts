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
  { key: "dashboard", label: "Dashboard", href: "/admin/dashboard", section: "Core" },
  { key: "today", label: "Today", href: "/admin/today", section: "Core" },
  {
    key: "bookings",
    label: "Bookings",
    href: "/admin/bookings",
    section: "Core",
    children: [
      { key: "bookings-upload", label: "Upload CSV", href: "/admin/bookings/upload" },
      { key: "uploads", label: "File Uploads", href: "/admin/uploads" },
    ],
  },
  { key: "booking-rules", label: "Booking Rules", href: "/admin/booking-rules", section: "Core" },
  { key: "pricing", label: "Pricing", href: "/admin/pricing", section: "Core" },
  { key: "analytics", label: "Analytics", href: "/admin/analytics", section: "Core" },

  // ——— Sites & Integrations ———
  { key: "tenant-sites", label: "Tenant Sites", href: "/admin/tenant-sites", section: "Sites & Integrations" },
  { key: "site-seo", label: "Site & SEO", href: "/admin/site-seo", section: "Sites & Integrations" },
  { key: "integrations", label: "Integrations", href: "/admin/integrations", section: "Sites & Integrations", feature: "integrations" },
  { key: "devices", label: "Gate Devices", href: "/admin/devices", section: "Sites & Integrations", feature: "devices" },

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
];


