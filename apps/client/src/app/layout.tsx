import type { Metadata } from 'next';
import { Manrope, Playfair_Display, Inter, Geist_Mono } from 'next/font/google';
import './globals.css';
import { ReduxProvider, ThemeProviderWrapper } from '@/components/providers';
import { Toaster } from '@/components/ui/sonner';
import { ErrorBoundary } from '@/components/error-boundary';
import { RouteProgress } from '@/components/route-progress';
import { cn } from '@/lib/utils';

const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });
const interHeading = Inter({ subsets: ['latin'], variable: '--font-heading', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-ui', display: 'swap' });
const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: '24/7 AI Receptionist for Dental Clinics',
  description: 'AI-powered receptionist for dental clinics. Never miss a call again.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn('font-mono', inter.variable, interHeading.variable, geistMono.variable)}
    >
      <body className={`${manrope.variable} ${playfairDisplay.variable} antialiased`}>
        <RouteProgress />
        <ReduxProvider>
          <ThemeProviderWrapper>
            <ErrorBoundary>{children}</ErrorBoundary>
            <Toaster />
          </ThemeProviderWrapper>
        </ReduxProvider>
      </body>
    </html>
  );
}
