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

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  prepareHeaders: applyAuthHeaders,
});

export const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
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
