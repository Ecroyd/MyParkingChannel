"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";

export function Header({ title, logoUrl, tenantSlug }: { title: string; logoUrl?: string; tenantSlug?: string }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const navLinks = [
    { href: tenantSlug ? `/sites/${tenantSlug}/book` : "/book", label: "Book" },
    { href: tenantSlug ? `/sites/${tenantSlug}/directions` : "/directions", label: "Directions" },
    { href: tenantSlug ? `/sites/${tenantSlug}/manage-booking` : "/manage-booking", label: "Manage Booking" },
    { href: tenantSlug ? `/sites/${tenantSlug}/contact` : "/contact", label: "Contact" },
  ];

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
          className="md:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
          aria-label="Toggle mobile menu"
        >
          {isMobileMenuOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <Menu className="h-6 w-6" />
          )}
        </button>
      </div>

      {/* Mobile Navigation Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white/95 backdrop-blur">
          <nav className="px-4 py-3 space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block px-3 py-2 text-sm hover:text-sky-600 hover:bg-slate-50 rounded-lg transition-colors"
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
