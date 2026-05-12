'use client';

import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { ThemeProvider } from 'next-themes';
import { setupListeners } from '@reduxjs/toolkit/query';
import { store } from '@/store';

setupListeners(store.dispatch);
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setCredentials, setHydrated, logout } from '@/features/auth/authSlice';
import { ensureFreshAccessToken, tryRefreshAccessToken } from '@/lib/api';
import {
  clearAuthSession,
  loadAuthSession,
  parseAccessTokenPayload,
  saveAuthSession,
} from '@/features/auth/session';

// Module-level flag: bootstrap runs exactly once per page lifecycle.
let bootstrapRan = false;

function AuthBootstrap() {
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAppSelector((state) => state.auth);

  useEffect(() => {
    if (bootstrapRan) return;
    bootstrapRan = true;

    // OAuth callback: LoginForm handles credentials, just mark hydrated.
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('oauth') === 'google') {
        dispatch(setHydrated());
        return;
      }
    }

    if (isAuthenticated) {
      // Store was preloaded from localStorage — user sees the dashboard immediately.
      // Validate the token in the background; if invalid, logout without blocking UI.
      void ensureFreshAccessToken().then((valid) => {
        if (!valid) {
          clearAuthSession();
          dispatch(logout());
        }
      });
      return;
    }

    // No persisted session — full async bootstrap for first-time or logged-out users.
    const runFullBootstrap = async () => {
      localStorage.removeItem('refresh_token');
      const accessToken = localStorage.getItem('auth_token');

      const validAccessToken = accessToken
        ? await ensureFreshAccessToken()
        : await tryRefreshAccessToken();

      if (!validAccessToken) {
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
          }),
        );
        return;
      }

      const tokenPayload = parseAccessTokenPayload(validAccessToken);
      if (!tokenPayload?.userId) {
        dispatch(setHydrated());
        return;
      }

      dispatch(
        setCredentials({
          user: {
            id: tokenPayload.userId,
            email: '',
            displayName: null,
            role: tokenPayload.role ?? 'admin',
          },
          tenantId: tokenPayload.tenantId ?? null,
          onboardingStatus: 'clinic-profile',
        }),
      );
    };

    void runFullBootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function AuthSessionSync() {
  const { isHydrated, isAuthenticated, user, tenantId, onboardingStatus } = useAppSelector(
    (state) => state.auth,
  );

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

export function ThemeProviderWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      {children}
    </ThemeProvider>
  );
}
