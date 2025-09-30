"use client";

import Link from "next/link";

export function Header({ title, logoUrl, tenantSlug }: { title: string; logoUrl?: string; tenantSlug?: string }) {
  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href={tenantSlug ? `/sites/${tenantSlug}` : "/"} className="flex items-center gap-3">
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt={title} 
              className="h-10 w-auto max-w-32 object-contain shadow-sm"
              style={{ minHeight: '32px', maxHeight: '48px' }}
            />
          ) : null}
          <span className="font-semibold text-lg tracking-tight">{title}</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href={tenantSlug ? `/sites/${tenantSlug}/book` : "/book"} className="hover:text-sky-600">Book</Link>
          <Link href={tenantSlug ? `/sites/${tenantSlug}/directions` : "/directions"} className="hover:text-sky-600">Directions</Link>
          <Link href={tenantSlug ? `/sites/${tenantSlug}/manage-booking` : "/manage-booking"} className="hover:text-sky-600">Manage Booking</Link>
          <Link href={tenantSlug ? `/sites/${tenantSlug}/contact` : "/contact"} className="hover:text-sky-600">Contact</Link>
        </nav>
      </div>
    </header>
  );
}

export function Footer({ title }: { title: string }) {
  return (
    <footer className="mt-16 border-t border-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-8 text-sm text-slate-600">
        © {new Date().getFullYear()} {title}. All rights reserved.
      </div>
    </footer>
  );
}
