'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { ThemeToggle, useMkTheme } from '@/components/marketing/theme-toggle';

const navLinks = [
  { label: 'Home', href: '/' },
  { label: 'Features', href: '/features' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Testimonials', href: '/testimonials' },
];

/* ── Circular brand logo ─────────────────────────────────────── */
export function BrandLogo() {
  return (
    <Link href="/" aria-label="Dentora — Home" className="group flex items-center gap-2.5">
      <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0a1020] p-1.5 ring-1 ring-[var(--mk-surface-border)] shadow-sm transition-transform duration-300 group-hover:scale-105">
        <Image
          src="/dentora.png"
          alt="Dentora"
          width={678}
          height={581}
          priority
          className="size-full object-contain"
        />
      </span>
      <span className="font-display text-lg font-bold tracking-tight mk-heading">Dentora</span>
    </Link>
  );
}

/* ── Sticky marketing/site header (reused on marketing + auth pages) ── */
export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, toggle] = useMkTheme();

  return (
    <header className="mk-header sticky top-0 z-50 w-full backdrop-blur-xl">
      <div className="mx-auto flex h-18 w-full max-w-7xl items-center justify-between px-5 py-3 sm:px-6 lg:px-8">
        <BrandLogo />

        <nav className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="rounded-full px-4 py-2 text-[15px] font-medium mk-muted transition-colors hover:text-[var(--mk-heading)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 lg:gap-3">
          <ThemeToggle theme={theme} onToggle={toggle} />
          <Link
            href="/login"
            className="hidden px-4 py-2 text-[15px] font-medium mk-body transition-colors hover:text-[var(--mk-heading)] lg:block"
          >
            Sign up / Login
          </Link>
          <Link
            href="/contact"
            className="mk-btn-primary hidden items-center gap-2 rounded-full px-5 py-2.5 text-[15px] font-semibold lg:flex"
          >
            Contact us
            <span className="flex size-5 items-center justify-center rounded-full bg-white/20 text-xs">
              →
            </span>
          </Link>

          <button
            type="button"
            aria-label="Toggle menu"
            className="mk-btn-ghost flex size-10 items-center justify-center rounded-full lg:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="mk-surface border-t border-[var(--mk-hairline)] px-5 py-4 lg:hidden">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="block rounded-lg px-2 py-2.5 text-[15px] font-medium mk-muted hover:text-[var(--mk-heading)]"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-4 flex flex-col gap-2">
            <Link
              href="/login"
              className="mk-btn-ghost rounded-full px-5 py-2.5 text-center text-[15px] font-medium"
            >
              Sign up / Login
            </Link>
            <Link
              href="/contact"
              className="mk-btn-primary rounded-full px-5 py-2.5 text-center text-[15px] font-semibold"
            >
              Contact us
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

/* ── Site footer ─────────────────────────────────────────────── */
export function SiteFooter() {
  return (
    <footer className="mk-footer">
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm mk-muted md:justify-start">
            <Link href="/" className="transition-colors hover:text-[var(--mk-heading)]">
              Home
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-[var(--mk-heading)]">
              Privacy Policy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-[var(--mk-heading)]">
              Terms of Service
            </Link>
            <Link href="/contact" className="transition-colors hover:text-[var(--mk-heading)]">
              Contact
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noreferrer"
              className="mk-btn-ghost flex size-9 items-center justify-center rounded-full mk-muted transition hover:text-[var(--mk-accent)]"
              aria-label="Instagram"
            >
              <svg className="size-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
            </a>
            <a
              href="https://linkedin.com"
              target="_blank"
              rel="noreferrer"
              className="mk-btn-ghost flex size-9 items-center justify-center rounded-full mk-muted transition hover:text-[var(--mk-accent)]"
              aria-label="LinkedIn"
            >
              <svg className="size-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </a>
            <a
              href="mailto:info@dentora.ai"
              className="text-sm mk-muted transition-colors hover:text-[var(--mk-heading)]"
            >
              info@dentora.ai
            </a>
          </div>
        </div>

        <div className="mt-8 border-t border-[var(--mk-hairline)] pt-6 text-center text-xs mk-faint">
          © {new Date().getFullYear()} Dentora AI Receptionist. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
