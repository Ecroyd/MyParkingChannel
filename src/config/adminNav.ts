// src/config/adminNav.ts
import type { UserRole } from '@/lib/auth/permissions';

export type NavNode = {
  key: string;
  label: string;
  href?: string;       // if missing, treat as a section/node only
  feature?: string;    // optional feature flag (SaaS), e.g. "integrations"
  children?: NavNode[];
  section?: string;    // explicit section title for top-level grouping
  minRole?: UserRole;  // minimum role required to see this item
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
  { key: "booking-rules", label: "Booking Rules", href: "/admin/booking-rules", section: "Core", minRole: "admin" },
  { key: "pricing", label: "Pricing", href: "/admin/pricing", section: "Core", minRole: "admin" },
  { key: "analytics", label: "Analytics", href: "/admin/analytics", section: "Core", minRole: "admin" },

  // ——— Sites & Integrations ———
  { key: "tenant-sites", label: "Tenant Sites", href: "/admin/tenant-sites-server", section: "Sites & Integrations", minRole: "admin" },
  { key: "site-seo", label: "Site & SEO", href: "/admin/site-seo", section: "Sites & Integrations", minRole: "admin" },
  { key: "integrations-flights", label: "Flight Data", href: "/admin/integrations/flights", section: "Sites & Integrations", minRole: "admin" },
  { 
    key: "integrations", 
    label: "Integrations", 
    href: "/admin/integrations", 
    section: "Sites & Integrations", 
    feature: "integrations",
    minRole: "admin",
  },
  { key: "partner-apis", label: "Partner APIs", href: "/admin/partner-apis", section: "Sites & Integrations", minRole: "admin" },
  { key: "devices", label: "Gate Devices", href: "/admin/devices", section: "Sites & Integrations", feature: "devices", minRole: "admin" },
  { key: "anpr", label: "ANPR / Gate Control", href: "/admin/anpr", section: "Sites & Integrations", minRole: "admin" },

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
    minRole: "admin",
    children: [
      { key: "members", label: "Members", href: "/admin/settings/members", minRole: "admin" },
      { key: "capacity", label: "Capacity", href: "/admin/settings/capacity", minRole: "admin" },
      { key: "pwa", label: "PWA Settings", href: "/admin/pwa-settings", minRole: "admin" },
      { key: "setup", label: "Initial Setup", href: "/admin/setup", minRole: "admin" },
    ],
  },
  { key: "payments", label: "Payments", href: "/admin/payments", section: "Settings", minRole: "owner" },
];


