import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE_URL, applyAuthHeaders } from '@/lib/api';

interface RegisterRequest {
  email: string;
  password: string;
  clinicName: string;
  displayName?: string;
}

interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    role: string;
  };
  tenantId: string | null;
}

interface RefreshRequest {
  refreshToken: string;
}

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

interface LogoutRequest {
  refreshToken: string;
}

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL,
    prepareHeaders: applyAuthHeaders,
  }),
  endpoints: (builder) => ({
    register: builder.mutation<LoginResponse, RegisterRequest>({
      query: (body) => ({
        url: '/auth/register',
        method: 'POST',
        body,
      }),
    }),
    login: builder.mutation<LoginResponse, LoginRequest>({
      query: (credentials) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
    }),
    refresh: builder.mutation<RefreshResponse, RefreshRequest>({
      query: (body) => ({
        url: '/auth/refresh',
        method: 'POST',
        body,
      }),
    }),
    logout: builder.mutation<{ message: string }, LogoutRequest>({
      query: (body) => ({
        url: '/auth/logout',
        method: 'POST',
        body,
      }),
    }),
  }),
});

export const {
  useRegisterMutation,
  useLoginMutation,
  useRefreshMutation,
  useLogoutMutation,
} = authApi;
