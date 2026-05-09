"use client";

import { useEffect } from "react";
import { Provider } from "react-redux";
import { ThemeProvider } from "next-themes";
import { store } from "@/store";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setCredentials, setHydrated } from "@/features/auth/authSlice";
import { ensureFreshAccessToken, tryRefreshAccessToken } from "@/lib/api";
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
      localStorage.removeItem("refresh_token");
      const accessToken = localStorage.getItem("auth_token");

      const validAccessToken = accessToken
        ? await ensureFreshAccessToken()
        : await tryRefreshAccessToken();

      if (!accessToken && !validAccessToken) {
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

      const tokenForPayload = validAccessToken ?? accessToken;
      if (!tokenForPayload) {
        if (!cancelled) {
          dispatch(setHydrated());
        }
        return;
      }

      const tokenPayload = parseAccessTokenPayload(tokenForPayload);
      if (!tokenPayload?.userId) {
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
