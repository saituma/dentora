import {
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from "@reduxjs/toolkit/query";
import { logout } from "@/features/auth/authSlice";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

const ACCESS_TOKEN_KEY = "auth_token";
const REFRESH_TOKEN_KEY = "refresh_token";

type RefreshResponse = {
  accessToken?: string;
  refreshToken?: string;
};

type AccessTokenPayload = {
  exp?: number;
};

export const getAuthHeaders = (): HeadersInit => {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const applyAuthHeaders = (headers: Headers): Headers => {
  const authHeaders = getAuthHeaders();
  if (authHeaders && typeof authHeaders === 'object') {
    for (const [key, value] of Object.entries(authHeaders)) {
      if (typeof value === 'string') {
        headers.set(key, value);
      }
    }
  }
  return headers;
};

export const clearAuthTokens = (): void => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

const parseAccessTokenPayload = (token: string): AccessTokenPayload | null => {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = atob(padded);
    return JSON.parse(decoded) as AccessTokenPayload;
  } catch {
    return null;
  }
};

const isAccessTokenExpired = (token: string, skewSeconds = 30): boolean => {
  const payload = parseAccessTokenPayload(token);
  if (!payload?.exp) return false;
  return payload.exp * 1000 <= Date.now() + skewSeconds * 1000;
};

let refreshInFlight: Promise<string | null> | null = null;

const runRefreshTokenRequest = async (): Promise<string | null> => {
  if (typeof window === "undefined") return null;

  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as RefreshResponse;
    if (!data.accessToken || !data.refreshToken) {
      return null;
    }

    localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
    return data.accessToken;
  } catch {
    return null;
  }
};

export const tryRefreshAccessToken = async (): Promise<string | null> => {
  if (!refreshInFlight) {
    refreshInFlight = runRefreshTokenRequest().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
};

export const ensureFreshAccessToken = async (): Promise<string | null> => {
  if (typeof window === "undefined") return null;

  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!accessToken) return null;
  if (!isAccessTokenExpired(accessToken)) {
    return accessToken;
  }

  return tryRefreshAccessToken();
};

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  prepareHeaders: applyAuthHeaders,
});

export const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const freshToken = await ensureFreshAccessToken();
  const existingToken = typeof window !== "undefined" ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
  if (existingToken && isAccessTokenExpired(existingToken) && !freshToken) {
    clearAuthTokens();
    api.dispatch(logout());
    return {
      error: {
        status: 401,
        data: "Session expired",
      },
    };
  }

  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status !== 401) {
    return result;
  }

  const refreshedAccessToken = await tryRefreshAccessToken();
  if (!refreshedAccessToken) {
    clearAuthTokens();
    api.dispatch(logout());
    return result;
  }

  result = await rawBaseQuery(args, api, extraOptions);
  return result;
};
