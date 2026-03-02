import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE_URL, applyAuthHeaders } from '@/lib/api';
import type { Service, KnowledgeDocument, TransferRule } from './types';

interface AiConfig {
  systemPrompt: string;
  voiceId: string;
  greetingMessage: string;
  transferNumber: string;
  services: Service[];
  knowledgeDocuments: KnowledgeDocument[];
  transferRules: TransferRule[];
}

export const aiConfigApi = createApi({
  reducerPath: 'aiConfigApi',
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL,
    prepareHeaders: applyAuthHeaders,
  }),
  tagTypes: ['AiConfig'],
  endpoints: (builder) => ({
    getConfig: builder.query<AiConfig, string>({
      query: (clinicId) => `/clinics/${clinicId}/ai-config`,
      providesTags: (_, __, clinicId) => [{ type: 'AiConfig', id: clinicId }],
    }),
    updateConfig: builder.mutation<
      AiConfig,
      { clinicId: string; data: Partial<AiConfig> }
    >({
      query: ({ clinicId, data }) => ({
        url: `/clinics/${clinicId}/ai-config`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (_, __, { clinicId }) => [
        { type: 'AiConfig', id: clinicId },
      ],
    }),
    uploadKnowledge: builder.mutation<
      KnowledgeDocument,
      { clinicId: string; file: File }
    >({
      query: ({ clinicId, file }) => {
        const formData = new FormData();
        formData.append('file', file);
        return {
          url: `/clinics/${clinicId}/knowledge`,
          method: 'POST',
          body: formData,
        };
      },
      invalidatesTags: (_, __, { clinicId }) => [
        { type: 'AiConfig', id: clinicId },
      ],
    }),
  }),
});

export const {
  useGetConfigQuery,
  useUpdateConfigMutation,
  useUploadKnowledgeMutation,
} = aiConfigApi;
