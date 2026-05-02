import Link from 'next/link';
import Image from 'next/image';
import { MarketingGuard } from '@/components/auth/marketing-guard';
import { ErrorBoundary } from '@/components/error-boundary';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MarketingGuard>
      <div className="relative flex min-h-svh flex-col bg-background">
        <div className="pointer-events-none fixed inset-0 -z-10 bg-grid-small text-foreground/[0.04]" />
        <header className="sticky top-0 z-50 w-full border-b border-foreground/[0.06] bg-background/92 backdrop-blur">
          <div className="mx-auto flex h-12 w-full max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-7">
            <Link href="/" aria-label="Home" className="flex items-center">
              <Image
                src="/dentora.png"
                alt="Dentora"
                width={678}
                height={581}
                priority
                className="h-8 w-auto"
              />
            </Link>
            <nav className="flex items-center gap-1.5 sm:gap-3">
              <Link
                href="/features"
                className="px-2 py-1 text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
              >
                Features
              </Link>
              <Link
                href="/pricing"
                className="px-2 py-1 text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
              >
                Pricing
              </Link>
              <Link
                href="/contact"
                className="px-2 py-1 text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
              >
                Contact
              </Link>
              <Link
                href="/login"
                className="inline-flex h-8 items-center justify-center border border-foreground/[0.12] px-3 text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground transition hover:bg-foreground/[0.04] hover:text-foreground"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="inline-flex h-8 items-center justify-center border border-foreground/[0.24] bg-foreground px-3 text-[10px] font-mono uppercase tracking-[0.16em] text-background transition hover:opacity-90"
              >
                Get started
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1"><ErrorBoundary>{children}</ErrorBoundary></main>
        <footer className="border-t border-foreground/[0.06] py-8">
          <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-5 sm:px-6 lg:px-7 md:flex-row">
            <p className="text-xs font-mono uppercase tracking-[0.12em] text-muted-foreground">
              All rights reserved.
            </p>
            <nav className="flex gap-6">
              <Link
                href="/features"
                className="text-xs font-mono uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
              >
                Features
              </Link>
              <Link
                href="/pricing"
                className="text-xs font-mono uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
              >
                Pricing
              </Link>
              <Link
                href="/contact"
                className="text-xs font-mono uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
              >
                Contact
              </Link>
              <Link
                href="/privacy"
                className="text-xs font-mono uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="text-xs font-mono uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
              >
                Terms
              </Link>
            </nav>
          </div>
        </footer>
      </div>
    </MarketingGuard>
  );
}
