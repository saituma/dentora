import type { AuthState } from "./types";

const AUTH_SESSION_KEY = "auth_session";

type PersistedAuthSession = Pick<
  AuthState,
  "user" | "tenantId" | "onboardingStatus"
>;

interface AccessTokenPayload {
  userId?: string;
  role?: string;
  tenantId?: string;
  exp?: number;
}

export function saveAuthSession(session: PersistedAuthSession): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

export function loadAuthSession(): PersistedAuthSession | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(AUTH_SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PersistedAuthSession;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.user || !parsed.user.id || !parsed.user.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_SESSION_KEY);
}

export function parseAccessTokenPayload(
  token: string
): AccessTokenPayload | null {
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
}
