/**
 * Base API configuration for RTK Query
 * Replace baseUrl with actual backend URL when backend is ready
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export const getAuthHeaders = (): HeadersInit => {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('auth_token');
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
