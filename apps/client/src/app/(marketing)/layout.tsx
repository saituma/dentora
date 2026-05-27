'use client';

import Link from 'next/link';
import Image from 'next/image';
import { MarketingGuard } from '@/components/auth/marketing-guard';
import { ErrorBoundary } from '@/components/error-boundary';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';

const navLinks = [
  { label: 'Features', href: '/features' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Testimonials', href: '/testimonials' },
  { label: 'Blog', href: '/contact' },
];

function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#111827]/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Home" className="flex items-center gap-2">
          <Image
            src="/dentora.png"
            alt="Dentora"
            width={678}
            height={581}
            priority
            className="h-9 w-auto"
          />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="px-4 py-2 text-[15px] text-[#c7d0d9]/70 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/login"
            className="px-5 py-2 text-[15px] font-medium text-[#c7d0d9]/80 transition hover:text-white"
          >
            Login
          </Link>
          <Link
            href="/contact"
            className="flex items-center gap-2 rounded-full bg-[#4fc3f7] px-6 py-2.5 text-[15px] font-medium text-white transition hover:bg-[#38b2f0]"
          >
            Contact us
            <span className="flex size-5 items-center justify-center rounded-full bg-[#111827]/20 text-xs">
              →
            </span>
          </Link>
        </div>

        <button className="lg:hidden text-[#c7d0d9]/80" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-white/10 bg-[#111827] px-5 py-4 lg:hidden">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="block py-2.5 text-[15px] text-[#c7d0d9]/70 hover:text-white"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-4 flex flex-col gap-2">
            <Link
              href="/login"
              className="rounded-full border border-white/10 px-5 py-2.5 text-center text-[15px] text-[#c7d0d9]/80"
            >
              Login
            </Link>
            <Link
              href="/contact"
              className="rounded-full bg-[#4fc3f7] px-5 py-2.5 text-center text-[15px] font-medium text-white"
            >
              Contact us
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#111827]">
      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-[#c7d0d9]/60 md:justify-start">
            <Link href="/" className="hover:text-white transition-colors">
              Home
            </Link>
            <Link href="/privacy" className="hover:text-white transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-white transition-colors">
              Terms of Service
            </Link>
            <Link href="/contact" className="hover:text-white transition-colors">
              Contact
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noreferrer"
              className="flex size-9 items-center justify-center rounded-full border border-white/10 text-[#c7d0d9]/60 transition hover:border-[#4fc3f7] hover:text-[#4fc3f7]"
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
              className="flex size-9 items-center justify-center rounded-full border border-white/10 text-[#c7d0d9]/60 transition hover:border-[#4fc3f7] hover:text-[#4fc3f7]"
              aria-label="LinkedIn"
            >
              <svg className="size-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </a>
            <a
              href="mailto:info@dentora.ai"
              className="text-sm text-[#c7d0d9]/60 hover:text-white transition-colors"
            >
              info@dentora.ai
            </a>
          </div>
        </div>

        <div className="mt-8 border-t border-white/10 pt-6 text-center text-xs text-[#c7d0d9]/50">
          © {new Date().getFullYear()} Dentora AI Receptionist. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <MarketingGuard>
      <div className="relative flex min-h-svh flex-col bg-transparent text-[#c7d0d9]">
        <Header />
        <main className="flex-1">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
        <Footer />
      </div>
    </MarketingGuard>
  );
}
