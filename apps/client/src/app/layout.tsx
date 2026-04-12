import type { Metadata } from 'next';
import './globals.css';
import { ReduxProvider, ThemeProviderWrapper } from '@/components/providers';
import { Toaster } from '@/components/ui/sonner';

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
        className="antialiased"
      >
        <ReduxProvider>
          <ThemeProviderWrapper>
            {children}
            <Toaster />
          </ThemeProviderWrapper>
        </ReduxProvider>
      </body>
    </html>
  );
}
