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

interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

interface SetPasswordRequest {
  newPassword: string;
}

interface AccountInfo {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  hasPassword: boolean;
  providers: string[];
}

interface ForgotPasswordRequest {
  email: string;
}

interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

interface SendEmailOtpRequest {
  email: string;
}

interface SendEmailOtpResponse {
  challengeId: string;
  expiresInSeconds: number;
}

interface VerifyEmailOtpRequest {
  email: string;
  code: string;
  clinicName?: string;
  displayName?: string;
  password?: string;
}

interface SendPhoneOtpRequest {
  phoneNumber: string;
}

interface SendPhoneOtpResponse {
  status: string;
}

interface VerifyPhoneOtpRequest {
  phoneNumber: string;
  code: string;
  clinicName: string;
  displayName?: string;
}

interface GoogleStartResponse {
  authUrl: string;
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
    sendEmailOtp: builder.mutation<SendEmailOtpResponse, SendEmailOtpRequest>({
      query: (body) => ({
        url: '/auth/email/send-otp',
        method: 'POST',
        body,
      }),
    }),
    verifyEmailOtp: builder.mutation<LoginResponse, VerifyEmailOtpRequest>({
      query: (body) => ({
        url: '/auth/email/verify-otp',
        method: 'POST',
        body,
      }),
    }),
    sendPhoneOtp: builder.mutation<SendPhoneOtpResponse, SendPhoneOtpRequest>({
      query: (body) => ({
        url: '/auth/phone/send-otp',
        method: 'POST',
        body,
      }),
    }),
    verifyPhoneOtp: builder.mutation<LoginResponse, VerifyPhoneOtpRequest>({
      query: (body) => ({
        url: '/auth/phone/verify-otp',
        method: 'POST',
        body,
      }),
    }),
    getGoogleStartUrl: builder.query<GoogleStartResponse, { returnTo?: string } | void>({
      query: (arg) => {
        const params = new URLSearchParams();
        if (arg?.returnTo) params.set('returnTo', arg.returnTo);
        const qs = params.toString();
        return `/auth/google/start${qs ? `?${qs}` : ''}`;
      },
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
    changePassword: builder.mutation<{ message: string }, ChangePasswordRequest>({
      query: (body) => ({
        url: '/auth/change-password',
        method: 'POST',
        body,
      }),
    }),
    forgotPassword: builder.mutation<{ message: string }, ForgotPasswordRequest>({
      query: (body) => ({
        url: '/auth/forgot-password',
        method: 'POST',
        body,
      }),
    }),
    resetPassword: builder.mutation<{ message: string }, ResetPasswordRequest>({
      query: (body) => ({
        url: '/auth/reset-password',
        method: 'POST',
        body,
      }),
    }),
    setPassword: builder.mutation<{ message: string }, SetPasswordRequest>({
      query: (body) => ({
        url: '/auth/set-password',
        method: 'POST',
        body,
      }),
    }),
    getMe: builder.query<AccountInfo, void>({
      query: () => '/auth/me',
    }),
  }),
});

export const {
  useRegisterMutation,
  useLoginMutation,
  useSendEmailOtpMutation,
  useVerifyEmailOtpMutation,
  useSendPhoneOtpMutation,
  useVerifyPhoneOtpMutation,
  useLazyGetGoogleStartUrlQuery,
  useRefreshMutation,
  useLogoutMutation,
  useChangePasswordMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useSetPasswordMutation,
  useGetMeQuery,
} = authApi;
