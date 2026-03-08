"use client";

import { useEffect } from "react";
import { Provider } from "react-redux";
import { ThemeProvider } from "next-themes";
import { store } from "@/store";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setCredentials, setHydrated } from "@/features/auth/authSlice";
import { clearAuthTokens, ensureFreshAccessToken } from "@/lib/api";
import {
  clearAuthSession,
  loadAuthSession,
  parseAccessTokenPayload,
  saveAuthSession,
} from "@/features/auth/session";

function AuthBootstrap() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const accessToken = localStorage.getItem("auth_token");
      const refreshToken = localStorage.getItem("refresh_token");

      if (!accessToken || !refreshToken) {
        clearAuthSession();
        if (!cancelled) {
          dispatch(setHydrated());
        }
        return;
      }

      const validAccessToken = await ensureFreshAccessToken();
      if (!validAccessToken) {
        clearAuthTokens();
        clearAuthSession();
        if (!cancelled) {
          dispatch(setHydrated());
        }
        return;
      }

      const persisted = loadAuthSession();
      if (persisted) {
        if (!cancelled) {
          dispatch(
            setCredentials({
              user: persisted.user,
              tenantId: persisted.tenantId,
              onboardingStatus: persisted.onboardingStatus,
            })
          );
        }
        return;
      }

      const tokenPayload = parseAccessTokenPayload(validAccessToken);
      if (!tokenPayload?.userId) {
        clearAuthTokens();
        clearAuthSession();
        if (!cancelled) {
          dispatch(setHydrated());
        }
        return;
      }

      if (!cancelled) {
        dispatch(
          setCredentials({
            user: {
              id: tokenPayload.userId,
              email: "",
              displayName: null,
              role: tokenPayload.role ?? "admin",
            },
            tenantId: tokenPayload.tenantId ?? null,
            onboardingStatus: "clinic-profile",
          })
        );
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  return null;
}

function AuthSessionSync() {
  const { isHydrated, isAuthenticated, user, tenantId, onboardingStatus } =
    useAppSelector((state) => state.auth);

  useEffect(() => {
    if (!isHydrated) return;

    if (!isAuthenticated || !user) {
      clearAuthSession();
      return;
    }

    saveAuthSession({ user, tenantId, onboardingStatus });
  }, [isHydrated, isAuthenticated, user, tenantId, onboardingStatus]);

  return null;
}

export function ReduxProvider({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <AuthBootstrap />
      <AuthSessionSync />
      {children}
    </Provider>
  );
}

export function ThemeProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      {children}
    </ThemeProvider>
  );
}
