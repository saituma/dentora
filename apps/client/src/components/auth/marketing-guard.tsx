"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppSelector } from "@/store/hooks";

export function MarketingGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isHydrated } = useAppSelector(
    (state) => state.auth
  );

  useEffect(() => {
    if (!isHydrated) return;
    if (isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isHydrated, router]);

  if (!isHydrated) {
    return null;
  }

  if (isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
