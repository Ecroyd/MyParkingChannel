"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
};

/** Fallback when tenant nav config is empty — labels match public airport-parking IA. */
const DEFAULT_NAV: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/#booking", label: "Book" },
  { href: "/directions", label: "Directions" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
  { href: "/manage-booking", label: "Manage Booking" },
];

const SHELL = "mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8";

function scrollToBooking(e?: React.MouseEvent) {
  e?.preventDefault();
  const el = document.getElementById("booking");
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const firstInput = el.querySelector<HTMLInputElement>("input, button");
    firstInput?.focus({ preventScroll: true });
  } else {
    window.location.href = "/book";
  }
}

export function Header({
  title,
  logoUrl,
  navItems,
}: {
  title: string;
  logoUrl?: string | null;
  tenantSlug?: string;
  navItems?: NavItem[];
}) {
  const [open, setOpen] = useState(false);
  const links = navItems?.length ? navItems : DEFAULT_NAV;

  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-white/95 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur-md">
      <div className={`${SHELL} flex h-[72px] items-center justify-between gap-6`}>
        <Link href="/" className="flex min-w-0 items-center gap-3" aria-label={`${title} home`}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              width={160}
              height={48}
              className="h-11 w-auto max-w-[11rem] object-contain sm:h-12 sm:max-w-[13rem]"
            />
          ) : (
            <span className="truncate text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
              {title}
            </span>
          )}
          {logoUrl ? <span className="sr-only">{title}</span> : null}
        </Link>

        <nav className="hidden items-center gap-1 xl:flex" aria-label="Primary">
          {links.map((link) => (
            <Link
              key={link.href + link.label}
              href={link.href}
              className="rounded-md px-3 py-2.5 text-[15px] font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              {link.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={scrollToBooking}
            className="ml-3 inline-flex h-12 items-center rounded-lg px-5 text-[15px] font-semibold shadow-sm transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            style={{
              backgroundColor: "var(--tenant-action, #1e40af)",
              color: "var(--tenant-action-fg, #ffffff)",
            }}
          >
            Book parking
          </button>
        </nav>

        <button
          type="button"
          className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 xl:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open ? (
        <div id="mobile-nav" className="border-t border-slate-200 bg-white xl:hidden">
          <nav className={`${SHELL} flex flex-col gap-1 py-4`} aria-label="Mobile">
            <button
              type="button"
              onClick={(e) => {
                setOpen(false);
                scrollToBooking(e);
              }}
              className="inline-flex h-12 items-center justify-center rounded-lg text-[15px] font-semibold"
              style={{
                backgroundColor: "var(--tenant-action, #1e40af)",
                color: "var(--tenant-action-fg, #ffffff)",
              }}
            >
              Book parking
            </button>
            {links.map((link) => (
              <Link
                key={link.href + link.label}
                href={link.href}
                className="rounded-md px-3 py-3.5 text-[15px] font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  );
}

export function Footer({
  title,
  logoUrl,
  description,
  phone,
  email,
  addressLines,
  hoursText,
}: {
  title: string;
  logoUrl?: string | null;
  description?: string | null;
  phone?: string | null;
  email?: string | null;
  addressLines?: string[];
  hoursText?: string | null;
  navItems?: NavItem[];
}) {
  const year = new Date().getFullYear();
  const bookingLinks = [
    { href: "/#booking", label: "Book parking" },
    { href: "/directions", label: "Directions" },
    { href: "/faq", label: "FAQ" },
    { href: "/manage-booking", label: "Manage booking" },
  ];
  const helpLinks = [
    { href: "/contact", label: "Contact" },
    { href: "/faq", label: "FAQ" },
    { href: "/terms", label: "Terms" },
    { href: "/privacy", label: "Privacy" },
  ];

  const hasContact =
    Boolean(phone?.trim()) ||
    Boolean(email?.trim()) ||
    Boolean(addressLines?.length) ||
    Boolean(hoursText?.trim());

  return (
    <footer
      className="mt-auto text-slate-300"
      style={{ backgroundColor: "var(--tenant-footer-bg, #0b1220)" }}
    >
      <div className={`${SHELL} grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-4`}>
        <div className="space-y-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              width={160}
              height={48}
              className="h-11 w-auto object-contain brightness-0 invert"
            />
          ) : null}
          <p className="text-base font-semibold text-white">{title}</p>
          {description ? (
            <p className="text-[15px] leading-relaxed text-slate-400">{description}</p>
          ) : null}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Book
          </p>
          <ul className="mt-4 space-y-3 text-[15px]">
            {bookingLinks.map((l) => (
              <li key={l.href + l.label}>
                <Link href={l.href} className="text-slate-300 hover:text-white">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Help
          </p>
          <ul className="mt-4 space-y-3 text-[15px]">
            {helpLinks.map((l) => (
              <li key={l.href + l.label}>
                <Link href={l.href} className="text-slate-300 hover:text-white">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {hasContact ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Contact
            </p>
            <ul className="mt-4 space-y-3 text-[15px] text-slate-300">
              {phone?.trim() ? (
                <li>
                  <a href={`tel:${phone}`} className="hover:text-white">
                    {phone}
                  </a>
                </li>
              ) : null}
              {email?.trim() ? (
                <li>
                  <a href={`mailto:${email}`} className="hover:text-white">
                    {email}
                  </a>
                </li>
              ) : null}
              {addressLines?.length ? (
                <li className="leading-relaxed">{addressLines.join(", ")}</li>
              ) : null}
              {hoursText?.trim() ? <li>{hoursText}</li> : null}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="border-t border-white/10">
        <div
          className={`${SHELL} flex flex-col gap-3 py-5 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between`}
        >
          <p>
            © {year} {title}
          </p>
          <div className="flex flex-wrap gap-5">
            <Link href="/terms" className="hover:text-slate-300">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-slate-300">
              Privacy
            </Link>
            <button type="button" className="hover:text-slate-300" aria-label="Cookie settings">
              Cookie settings
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function PageShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string | null;
}) {
  return (
    <main className={`${SHELL} py-12 sm:py-16`}>
      <header className="mb-10 max-w-3xl border-b border-slate-200 pb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-4 text-lg leading-relaxed text-slate-600">{subtitle}</p>
        ) : null}
      </header>
      <div className="space-y-8">{children}</div>
    </main>
  );
}
