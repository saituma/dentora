'use client';

import Link from 'next/link';
import Image from 'next/image';
import { MarketingGuard } from '@/components/auth/marketing-guard';
import { ErrorBoundary } from '@/components/error-boundary';
import { useState } from 'react';
import { ChevronDown, Menu, X } from 'lucide-react';

const navLinks = [
  { label: 'Home', href: '/' },
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Testimonials', href: '#testimonials' },
];

const resourceLinks = [
  { label: 'Help Center', href: '/contact' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
  { label: 'HIPAA Compliance', href: '/terms' },
];

function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.06] bg-[#0a0e1a]/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Home" className="flex items-center gap-2">
          <Image
            src="/dentora.png"
            alt="Dentora"
            width={678}
            height={581}
            priority
            className="h-10 w-auto"
          />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="relative px-3 py-2 text-sm text-gray-300 transition-colors hover:text-white"
            >
              {link.label}
              {link.label === 'Home' && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-blue-500" />
              )}
            </Link>
          ))}
          <div className="relative">
            <button
              onClick={() => setResourcesOpen(!resourcesOpen)}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-300 transition-colors hover:text-white"
            >
              Resources
              <ChevronDown className="size-3.5" />
            </button>
            {resourcesOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-white/10 bg-[#0f1424] p-2 shadow-xl">
                {resourceLinks.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="block rounded-md px-3 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white"
                    onClick={() => setResourcesOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/login"
            className="rounded-lg border border-white/10 px-5 py-2 text-sm font-medium text-gray-300 transition hover:bg-white/5 hover:text-white"
          >
            Login
          </Link>
          <Link
            href="/contact"
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            Book a Demo
          </Link>
        </div>

        <button
          className="lg:hidden text-gray-300"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-white/5 bg-[#0a0e1a] px-5 py-4 lg:hidden">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="block py-2 text-sm text-gray-300 hover:text-white"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-4 flex flex-col gap-2">
            <Link href="/login" className="rounded-lg border border-white/10 px-5 py-2 text-center text-sm text-gray-300">
              Login
            </Link>
            <Link href="/contact" className="rounded-lg bg-blue-600 px-5 py-2 text-center text-sm font-medium text-white">
              Book a Demo
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

const footerColumns = [
  {
    title: 'PRODUCT',
    links: [
      { label: 'Features', href: '/features' },
      { label: 'How it Works', href: '#how-it-works' },
      { label: 'Integrations', href: '#' },
    ],
  },
  {
    title: 'COMPANY',
    links: [
      { label: 'About Us', href: '#' },
      { label: 'Careers', href: '#' },
      { label: 'Blog', href: '#' },
      { label: 'Contact Us', href: '/contact' },
    ],
  },
  {
    title: 'RESOURCES',
    links: [
      { label: 'Help Center', href: '/contact' },
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
      { label: 'HIPAA Compliance', href: '/terms' },
    ],
  },
];

function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#060a14]">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/dentora.png"
                alt="Dentora"
                width={678}
                height={581}
                className="h-12 w-auto"
              />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-gray-400">
              The #1 AI receptionist for dental clinics. Answer every call. Book more appointments. Delight every patient.
            </p>
            <div className="mt-6 flex gap-4">
              {['f', 'in'].map((icon) => (
                <div
                  key={icon}
                  className="flex size-8 items-center justify-center rounded-full border border-white/10 text-xs text-gray-400 transition hover:border-blue-500 hover:text-blue-400"
                >
                  {icon}
                </div>
              ))}
            </div>
          </div>

          {footerColumns.map((col) => (
            <div key={col.title}>
              <h4 className="mb-4 text-sm font-semibold text-gray-300">{col.title}</h4>
              <ul className="space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm text-gray-500 transition hover:text-blue-400">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h4 className="mb-2 text-sm font-semibold text-white">Ready to Get Started?</h4>
            <p className="mb-4 text-xs leading-relaxed text-gray-400">
              Book a demo today and see how Dentora can grow your practice.
            </p>
            <Link
              href="/contact"
              className="inline-flex items-center gap-1 text-sm font-medium text-blue-400 transition hover:text-blue-300"
            >
              Book a Demo →
            </Link>
          </div>
        </div>
      </div>

      <div className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-8">
          <p className="text-xs text-gray-500">© {new Date().getFullYear()} Dentora AI Receptionist. All rights reserved.</p>
          <a
            href="https://clientreach.ai"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-full border border-white/[0.06] bg-white/[0.03] px-5 py-2.5 backdrop-blur-md no-underline transition-colors hover:border-[#0EA5E9]/40"
          >
            <img
              src="/clientreach-logo.png"
              alt="Client Reach AI"
              className="h-5 w-5 rounded object-contain"
            />
            <span className="text-xs font-medium tracking-wider text-gray-500">
              Made by
            </span>
            <span className="text-sm font-bold tracking-wide text-[#0EA5E9]">
              Client Reach AI
            </span>
          </a>
          <div className="flex items-center gap-2 rounded border border-white/10 px-3 py-1.5 text-xs text-gray-400">
            <span className="font-semibold">HIPAA</span>
            <span className="text-[10px] text-gray-500">COMPLIANT</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MarketingGuard>
      <div className="relative flex min-h-svh flex-col bg-[#0a0e1a] text-white">
        <Header />
        <main className="flex-1"><ErrorBoundary>{children}</ErrorBoundary></main>
        <Footer />
      </div>
    </MarketingGuard>
  );
}
