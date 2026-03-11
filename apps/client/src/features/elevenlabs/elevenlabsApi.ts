import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from '@/lib/api';

export interface CreateConversationTokenRequest {
  agentId: string;
}

export interface CreateConversationTokenResponse {
  data: {
    token: string;
    expiresAt: number | string | null;
  };
  meta: {
    agentId: string;
    keyResolvedVia: 'tenant' | 'platform';
    correlationId: string;
  };
}

export interface CreateSignedUrlResponse {
  data: {
    signedUrl: string;
  };
  meta: {
    agentId: string;
    keyResolvedVia: 'tenant' | 'platform';
    correlationId: string;
  };
}

export interface ConversationDetailsResponse {
  data: Record<string, unknown>;
  meta: {
    conversationId: string;
    keyResolvedVia: 'tenant' | 'platform';
    correlationId: string;
  };
}

export const elevenlabsApi = createApi({
  reducerPath: 'elevenlabsApi',
  baseQuery: baseQueryWithReauth,
  endpoints: (builder) => ({
    createConversationToken: builder.mutation<CreateConversationTokenResponse, CreateConversationTokenRequest>({
      query: (body) => ({
        url: '/elevenlabs/convai/token',
        method: 'POST',
        body,
      }),
    }),
    createSignedUrl: builder.mutation<CreateSignedUrlResponse, CreateConversationTokenRequest>({
      query: (body) => ({
        url: '/elevenlabs/convai/signed-url',
        method: 'POST',
        body,
      }),
    }),
    getConversationDetails: builder.query<ConversationDetailsResponse, { conversationId: string }>({
      query: ({ conversationId }) => `/elevenlabs/convai/conversations/${conversationId}`,
    }),
  }),
});

export const {
  useCreateConversationTokenMutation,
  useCreateSignedUrlMutation,
  useLazyGetConversationDetailsQuery,
} = elevenlabsApi;
