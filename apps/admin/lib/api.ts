const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export { API_BASE_URL };

let csrfToken: string | null = null;

export async function fetchCsrfToken(): Promise<string | null> {
  if (csrfToken) return csrfToken;
  try {
    const res = await fetch(`${API_BASE_URL}/csrf-token`, {
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { csrfToken?: string };
    csrfToken = data.csrfToken ?? null;
    return csrfToken;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("admin_token");
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("admin_refresh_token");
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem("admin_token", access);
  localStorage.setItem("admin_refresh_token", refresh);
}

export function clearTokens() {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_refresh_token");
}

function parseJwt(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split(".")[1];
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = parseJwt(token);
  if (!payload || typeof payload.exp !== "number") return true;
  return Date.now() >= (payload.exp - 30) * 1000;
}

export function getTokenPayload() {
  const token = getAccessToken();
  if (!token) return null;
  return parseJwt(token) as {
    userId: string;
    role: string;
    tenantId: string | null;
  } | null;
}

async function refreshAccessToken(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  try {
    const csrf = await fetchCsrfToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (csrf) headers["x-csrf-token"] = csrf;
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) {
      clearTokens();
      return null;
    }
    const data = (await res.json()) as {
      accessToken: string;
      refreshToken: string;
    };
    setTokens(data.accessToken, data.refreshToken);
    return data.accessToken;
  } catch {
    clearTokens();
    return null;
  }
}

export async function ensureFreshToken(): Promise<string | null> {
  let token = getAccessToken();
  if (!token) return null;
  if (isTokenExpired(token)) {
    token = await refreshAccessToken();
  }
  return token;
}

import type {
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from "@reduxjs/toolkit/query";
import { fetchBaseQuery } from "@reduxjs/toolkit/query/react";

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  credentials: "include",
  prepareHeaders: async (headers) => {
    const token = await ensureFreshToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const csrf = await fetchCsrfToken();
    if (csrf) headers.set("x-csrf-token", csrf);
    return headers;
  },
});

export const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions);
  if (result.error && result.error.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      result = await rawBaseQuery(args, api, extraOptions);
    }
  }
  return result;
};
