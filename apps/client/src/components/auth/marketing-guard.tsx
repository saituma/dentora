"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAppSelector } from "@/store/hooks";

export function MarketingGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isHydrated, onboardingStatus } = useAppSelector(
    (state) => state.auth
  );

  const isPublicAllowed = pathname === "/privacy" || pathname === "/terms";
  const onboardingComplete = onboardingStatus === "complete";

  useEffect(() => {
    if (!isHydrated) return;
    // Users still in setup may browse the marketing site (e.g. home, pricing).
    // Only skip marketing once onboarding is finished.
    if (isAuthenticated && onboardingComplete && !isPublicAllowed) {
      router.replace("/dashboard");
    }
  }, [
    isAuthenticated,
    isHydrated,
    onboardingComplete,
    router,
    isPublicAllowed,
  ]);

  if (!isHydrated) {
    return null;
  }

  if (isAuthenticated && onboardingComplete && !isPublicAllowed) {
    return null;
  }

  return <>{children}</>;
}
