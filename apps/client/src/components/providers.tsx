"use client";

import { useEffect } from "react";
import { Provider } from "react-redux";
import { ThemeProvider } from "next-themes";
import { store } from "@/store";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setCredentials, setHydrated } from "@/features/auth/authSlice";
import {
  clearAuthSession,
  loadAuthSession,
  parseAccessTokenPayload,
  saveAuthSession,
} from "@/features/auth/session";

function AuthBootstrap() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const accessToken = localStorage.getItem("auth_token");
    const refreshToken = localStorage.getItem("refresh_token");

    if (!accessToken || !refreshToken) {
      clearAuthSession();
      dispatch(setHydrated());
      return;
    }

    const persisted = loadAuthSession();
    if (persisted) {
      dispatch(
        setCredentials({
          user: persisted.user,
          tenantId: persisted.tenantId,
          onboardingStatus: persisted.onboardingStatus,
        })
      );
      return;
    }

    const tokenPayload = parseAccessTokenPayload(accessToken);
    if (!tokenPayload?.userId) {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("refresh_token");
      clearAuthSession();
      dispatch(setHydrated());
      return;
    }

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
