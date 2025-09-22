"use client";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ADMIN_NAV } from "@/config/adminNav";

function AdminTabs({ active }: { active: "today"|"bookings"|"pricing"|"analytics"|"settings" }) {
  // Get top-level items from the config
  const items = ADMIN_NAV
    .filter(node => node.href && !node.children) // Only top-level items without children
    .map(node => [node.key, node.href!] as const);

  return (
    <div className="mt-4 flex gap-2">
      {items.map(([key, href]) => (
        <Link
          key={key}
          href={href}
          className={cn(
            "px-3 py-1.5 rounded-xl border",
            active === key ? "bg-black text-white" : "bg-white/70 hover:bg-white"
          )}
        >
          {key[0].toUpperCase() + key.slice(1)}
        </Link>
      ))}
    </div>
  );
}

export default AdminTabs;

