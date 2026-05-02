import type { Metadata } from 'next';
import { Manrope, Playfair_Display } from 'next/font/google';
import './globals.css';
import { ReduxProvider, ThemeProviderWrapper } from '@/components/providers';
import { Toaster } from '@/components/ui/sonner';
import { ErrorBoundary } from '@/components/error-boundary';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-ui',
});

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: '24/7 AI Receptionist for Dental Clinics',
  description:
    'AI-powered receptionist for dental clinics. Never miss a call again.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${manrope.variable} ${playfairDisplay.variable} antialiased`}
      >
        <ReduxProvider>
          <ThemeProviderWrapper>
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
            <Toaster />
          </ThemeProviderWrapper>
        </ReduxProvider>
      </body>
    </html>
  );
}
