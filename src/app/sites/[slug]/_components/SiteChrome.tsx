"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";

export function Header({ title, logoUrl, tenantSlug }: { title: string; logoUrl?: string; tenantSlug?: string }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const basePath = tenantSlug ? `/sites/${tenantSlug}` : "";
  const navLinks = [
    { href: `${basePath}/book`, label: "Book" },
    { href: `${basePath}/directions`, label: "Directions" },
    { href: `${basePath}/manage-booking`, label: "Manage Booking" },
    { href: `${basePath}/contact`, label: "Contact" },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href={basePath || "/"} className="flex items-center gap-3">
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
        
        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6 text-sm">
          {navLinks.map((link) => (
            <Link 
              key={link.href}
              href={link.href} 
              className="hover:text-sky-600 transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Mobile Menu Button */}
        <button
          onClick={toggleMobileMenu}
          className="md:hidden p-3 rounded-lg hover:bg-slate-100 transition-colors border border-slate-200 bg-white shadow-sm"
          aria-label="Toggle mobile menu"
          style={{ 
            minWidth: '44px', 
            minHeight: '44px',
            WebkitTapHighlightColor: 'transparent',
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none'
          }}
        >
          {isMobileMenuOpen ? (
            <X className="h-6 w-6 text-slate-700" />
          ) : (
            <Menu className="h-6 w-6 text-slate-700" />
          )}
        </button>
      </div>

      {/* Mobile Navigation Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white shadow-lg">
          <nav className="px-4 py-4 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block px-4 py-3 text-base font-medium text-slate-700 hover:text-sky-600 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-200"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
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
