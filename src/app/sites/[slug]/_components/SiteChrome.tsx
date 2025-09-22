"use client";

import Link from "next/link";

export function Header({ title, logoUrl }: { title: string; logoUrl?: string }) {
  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
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
          <Link href="/book" className="hover:text-sky-600">Book</Link>
          <Link href="/directions" className="hover:text-sky-600">Directions</Link>
          <Link href="/manage-booking" className="hover:text-sky-600">Manage Booking</Link>
          <Link href="/contact" className="hover:text-sky-600">Contact</Link>
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
