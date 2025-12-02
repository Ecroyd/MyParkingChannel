"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { ADMIN_NAV, NavNode } from "@/config/adminNav";
import { roleAtLeast } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/auth/permissions";

type Groups = Record<string, NavNode[]>;

function isActive(path: string, href?: string) {
  if (!href) return false;
  return path === href || path.startsWith(href + "/");
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`}
      viewBox="0 0 20 20" fill="currentColor"
    >
      <path d="M7.293 14.707a1 1 0 0 1 0-1.414L10.586 10 7.293 6.707a1 1 0 1 1 1.414-1.414l4 4a1 1 0 0 1 0 1.414l-4 4a1 1 0 0 1-1.414 0z" />
    </svg>
  );
}

export default function MobileSidebar({ features = [] as string[], userRole }: { features?: string[]; userRole: UserRole }) {
  const pathname = usePathname();

  // 1) Filter items by feature flags and role requirements
  const allowed = (n: NavNode) => {
    // Check feature flags
    if (n.feature && !features.includes(n.feature)) return false;
    // Check role requirements
    if (n.minRole && !roleAtLeast(userRole, n.minRole)) return false;
    return true;
  };
  const top = ADMIN_NAV.filter(allowed);

  // 2) Group by section (single-line headings)
  const groups: Groups = top.reduce((acc, n) => {
    const s = n.section || "General";
    (acc[s] ||= []).push(n);
    return acc;
  }, {} as Groups);

  // 3) Auto-open sections that contain active routes
  const autoOpen = React.useMemo(() => {
    const m = new Map<string, boolean>();
    for (const [section, nodes] of Object.entries(groups)) {
      // auto-open if any link in the section matches the current route
      const match = nodes.some(n =>
        isActive(pathname!, n.href) ||
        (n.children || []).some(c => isActive(pathname!, c.href))
      );
      m.set(section, match);
    }
    return m;
  }, [pathname, JSON.stringify(groups)]);

  const [open, setOpen] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    setOpen(autoOpenObject(autoOpen));
  }, [pathname]);

  function autoOpenObject(m: Map<string, boolean>) {
    const obj: Record<string, boolean> = {};
    for (const [k, v] of m.entries()) obj[k] = v;
    return obj;
  }

  function toggle(section: string) {
    setOpen(prev => {
      const next = { ...prev, [section]: !prev[section] };
      return next;
    });
  }

  return (
    <div className="w-full">
      <nav className="w-full">
        {Object.entries(groups).map(([section, nodes]) => {
          const isOpen = !!open[section];
          return (
            <div key={section} className="mb-4">
              {/* Section heading */}
              <button
                type="button"
                onClick={() => toggle(section)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between px-3 py-3 text-sm font-medium uppercase tracking-wide text-gray-700 hover:bg-gray-50 rounded-lg"
                title={section}
              >
                <span className="truncate">{section}</span>
                <Chevron open={isOpen} />
              </button>

              {/* Collapsible content */}
              <div
                className={`overflow-hidden transition-[max-height] duration-200 ${
                  isOpen ? "max-h-[800px]" : "max-h-0"
                }`}
              >
                <ul className="mt-2 space-y-1">
                  {nodes.map((node) => {
                    const topActive =
                      isActive(pathname!, node.href) ||
                      (node.children || []).some(c => isActive(pathname!, c.href));

                    return (
                      <li key={node.key}>
                        {/* Top-level item */}
                        {node.href && (
                          <Link
                            href={node.href}
                            className={[
                              "block rounded-lg px-3 py-3 text-sm transition",
                              topActive
                                ? "bg-blue-100 text-blue-700 font-medium"
                                : "text-gray-700 hover:bg-gray-50",
                            ].join(" ")}
                          >
                            {node.label}
                          </Link>
                        )}

                        {/* Children (sub headings) */}
                        {node.children && node.children.length > 0 && (
                          <ul className="mt-1 space-y-1">
                            {node.children.filter(allowed).map((child) => {
                              const childActive = isActive(pathname!, child.href);
                              return (
                                <li key={child.key}>
                                  <Link
                                    href={child.href!}
                                    className={[
                                      "block rounded-lg px-4 py-2 text-sm transition",
                                      childActive
                                        ? "bg-blue-100 text-blue-700 font-medium"
                                        : "text-gray-600 hover:bg-gray-50",
                                    ].join(" ")}
                                  >
                                    {child.label}
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          );
        })}
      </nav>
    </div>
  );
}
