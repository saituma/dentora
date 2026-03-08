"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppSelector } from "@/store/hooks";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireOnboardingComplete?: boolean;
}

export function ProtectedRoute({
  children,
  requireOnboardingComplete = false,
}: ProtectedRouteProps) {
  const router = useRouter();
  const { isAuthenticated, onboardingStatus, isHydrated } = useAppSelector(
    (state) => state.auth
  );

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (
      requireOnboardingComplete &&
      onboardingStatus !== "complete"
    ) {
      const step =
        onboardingStatus === "clinic-profile"
          ? "clinic-profile"
          : onboardingStatus === "plan"
            ? "plan"
          : onboardingStatus === "knowledge-base"
            ? "knowledge-base"
            : onboardingStatus === "voice"
              ? "voice"
              : onboardingStatus === "rules"
                ? "rules"
                : onboardingStatus === "integrations"
                  ? "integrations"
                  : onboardingStatus === "ai-chat"
                    ? "ai-chat"
                  : onboardingStatus === "test-call"
                    ? "test-call"
                    : "clinic-profile";
      router.replace(`/onboarding/${step}`);
    }
  }, [
    isAuthenticated,
    onboardingStatus,
    requireOnboardingComplete,
    router,
    isHydrated,
  ]);

  if (!isHydrated) {
    return null;
  }

  if (!isAuthenticated) {
    return null;
  }

  if (
    requireOnboardingComplete &&
    onboardingStatus !== "complete"
  ) {
    return null;
  }

  return <>{children}</>;
}
