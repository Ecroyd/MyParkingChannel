"use client";
import Link from "next/link";

export function Header({ title, slug }: { title: string; slug: string }) {
  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href={`/t/${slug}`} className="font-semibold text-lg tracking-tight">{title}</Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href={`/t/${slug}/book`} className="hover:text-sky-600">Book</Link>
          <Link href={`/t/${slug}/manage`} className="hover:text-sky-600">Manage</Link>
          <Link href={`/t/${slug}/contact`} className="hover:text-sky-600">Contact</Link>
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
