import Link from 'next/link';
import Image from 'next/image';
import { MarketingGuard } from '@/components/auth/marketing-guard';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MarketingGuard>
      <div className="flex min-h-svh flex-col">
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 flex h-14 items-center justify-between">
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
            <nav className="flex items-center gap-4">
              <Link
                href="/features"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Features
              </Link>
              <Link
                href="/pricing"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Pricing
              </Link>
              <Link
                href="/contact"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Contact
              </Link>
              <Link
                href="/login"
                className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                Get started
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t py-8">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-between gap-4 md:flex-row">
            <p className="text-sm text-muted-foreground">
              All rights reserved.
            </p>
            <nav className="flex gap-6">
              <Link
                href="/features"
                className="text-sm text-muted-foreground hover:underline"
              >
                Features
              </Link>
              <Link
                href="/pricing"
                className="text-sm text-muted-foreground hover:underline"
              >
                Pricing
              </Link>
              <Link
                href="/contact"
                className="text-sm text-muted-foreground hover:underline"
              >
                Contact
              </Link>
              <Link
                href="/privacy"
                className="text-sm text-muted-foreground hover:underline"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="text-sm text-muted-foreground hover:underline"
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
