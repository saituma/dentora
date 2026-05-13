export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dentora Admin",
  description: "Platform administration for Dentora",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      {/* Restore color theme before first paint to avoid flash */}
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: inline script for theme persistence, no user input
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem('dentora-admin-color-theme');if(t&&t!=='default')document.documentElement.setAttribute('data-theme',t);}catch(e){}})()`,
        }}
      />
      <body className="min-h-[100dvh] flex flex-col font-sans selection:bg-emerald-500/20">
        <div className="grain-overlay" />
        <Providers>
          {children}
          <Toaster position="top-right" richColors />
        </Providers>
      </body>
    </html>
  );
}
