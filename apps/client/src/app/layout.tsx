import type { Metadata } from 'next';
import { Manrope, Playfair_Display, Inter, Geist_Mono } from 'next/font/google';
import './globals.css';
import { ReduxProvider, ThemeProviderWrapper } from '@/components/providers';
import { Toaster } from '@/components/ui/sonner';
import { ErrorBoundary } from '@/components/error-boundary';
import { cn } from "@/lib/utils";

const geistMono = Geist_Mono({subsets:['latin'],variable:'--font-mono'});

const interHeading = Inter({subsets:['latin'],variable:'--font-heading'});

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

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
    <html lang="en" suppressHydrationWarning className={cn("font-mono", inter.variable, interHeading.variable, geistMono.variable)}>
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
