import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE_URL, applyAuthHeaders } from '@/lib/api';
import type { User, Clinic } from './types';

interface LoginRequest {
  email: string;
  password: string;
}

interface SignupRequest {
  clinicName: string;
  email: string;
  password: string;
  phone?: string;
}

interface AuthResponse {
  user: User;
  clinic: Clinic;
  token: string;
  onboardingStatus?: string;
}

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL,
    prepareHeaders: applyAuthHeaders,
  }),
  endpoints: (builder) => ({
    login: builder.mutation<AuthResponse, LoginRequest>({
      query: (credentials) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
    }),
    signup: builder.mutation<AuthResponse, SignupRequest>({
      query: (data) => ({
        url: '/auth/signup',
        method: 'POST',
        body: data,
      }),
    }),
    me: builder.query<{ user: User; clinic: Clinic }, void>({
      query: () => '/auth/me',
    }),
    verifyEmail: builder.mutation<{ success: boolean }, { token: string }>({
      query: ({ token }) => ({
        url: '/auth/verify-email',
        method: 'POST',
        body: { token },
      }),
    }),
    forgotPassword: builder.mutation<{ success: boolean }, { email: string }>({
      query: (body) => ({
        url: '/auth/forgot-password',
        method: 'POST',
        body,
      }),
    }),
  }),
});

export const {
  useLoginMutation,
  useSignupMutation,
  useMeQuery,
  useVerifyEmailMutation,
  useForgotPasswordMutation,
} = authApi;
