"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAppSelector } from "@/store/hooks";

export function MarketingGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isHydrated } = useAppSelector(
    (state) => state.auth
  );

  const isPublicAllowed = pathname === "/privacy" || pathname === "/terms";

  useEffect(() => {
    if (!isHydrated) return;
    if (isAuthenticated && !isPublicAllowed) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isHydrated, router, isPublicAllowed]);

  if (!isHydrated) {
    return null;
  }

  if (isAuthenticated && !isPublicAllowed) {
    return null;
  }

  return <>{children}</>;
}
