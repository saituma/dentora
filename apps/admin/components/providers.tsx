"use client";

import { ThemeProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { useEffect } from "react";
import { Provider } from "react-redux";
import { KBarProvider } from "@/components/kbar/provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setCredentials } from "@/features/auth/authSlice";
import { getAccessToken, getTokenPayload } from "@/lib/api";
import { store } from "@/store";

function AuthBootstrap() {
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const payload = getTokenPayload();
    if (!payload) return;
    store.dispatch(
      setCredentials({
        user: {
          id: payload.userId,
          email: "",
          displayName: null,
          role: payload.role,
        },
      }),
    );
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NuqsAdapter>
      <Provider store={store}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          disableTransitionOnChange
          enableSystem={false}
        >
          <KBarProvider>
            <TooltipProvider>
              <AuthBootstrap />
              {children}
            </TooltipProvider>
          </KBarProvider>
        </ThemeProvider>
      </Provider>
    </NuqsAdapter>
  );
}
