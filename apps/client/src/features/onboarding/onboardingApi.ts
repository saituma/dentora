import { createApi } from '@reduxjs/toolkit/query/react';
import {
  API_BASE_URL,
  baseQueryWithReauth,
  getAuthHeaders,
  tryRefreshAccessToken,
} from '@/lib/api';

export interface OnboardingStatus {
  tenantId: string;
  currentStep: string;
  completedSteps: string[];
  readinessScore: number;
  validationErrors: Array<{ domain: string; field?: string; message: string; severity: string }>;
  validationWarnings: Array<{ domain: string; field?: string; message: string; severity: string }>;
  isReady: boolean;
}

export interface ReadinessScorecard {
  clinicProfile: { score: number; weight: number; issues: unknown[] };
  serviceCatalog: { score: number; weight: number; issues: unknown[] };
  bookingRules: { score: number; weight: number; issues: unknown[] };
  policyEscalation: { score: number; weight: number; issues: unknown[] };
  toneProfile: { score: number; weight: number; issues: unknown[] };
  integrations: { score: number; weight: number; issues: unknown[] };
  totalScore: number;
  isDeployable: boolean;
}

export interface ClinicProfileInput {
  clinicName: string;
  address?: string;
  phone?: string;
  email?: string;
  timezone?: string;
  operatingHours?: Record<string, unknown>;
  afterHoursBehavior?: 'voicemail' | 'callback' | 'emergency_routing';
}

export interface ServiceInput {
  id?: string;
  serviceName: string;
  category: string;
  description?: string;
  durationMinutes: number;
  price?: string;
  isActive?: boolean;
}

export interface BookingRulesInput {
  advanceBookingDays?: number;
  cancellationHours?: number;
  minNoticeHours?: number;
  maxFutureDays?: number;
  defaultAppointmentDurationMinutes?: number;
  bufferBetweenAppointmentsMinutes?: number;
  operatingSchedule?: Record<string, unknown>;
  closedDates?: string[];
  allowedChannels?: string[];
  doubleBookingPolicy?: 'forbid' | 'conditional' | 'manual-review';
  emergencySlotPolicy?: 'reserved' | 'normal' | 'manual-review';
}

export interface PolicyInput {
  id?: string;
  policyType: string;
  content: string;
}

export interface ContextDocumentInput {
  name: string;
  content: string;
  mimeType?: string;
}

export interface VoiceProfileInput {
  tone?: 'professional' | 'warm' | 'friendly' | 'calm';
  language?: string;
  greeting?: string;
  voiceId?: string;
  speed?: number;
  verbosityLevel?: 'short' | 'balanced' | 'detailed';
  empathyLevel?: 'low' | 'medium' | 'high';
  greetingStyle?: 'formal' | 'friendly';
}

export interface FaqInput {
  id?: string;
  question: string;
  answer: string;
  category?: string;
}

export interface VoicePreviewInput {
  voiceId: string;
  text: string;
  speed?: number;
  language?: string;
}

export interface AvailableVoiceOption {
  voiceId: string;
  name: string;
  label: string;
  previewUrl?: string;
  gender?: string;
  accent?: string;
  locale?: string;
  category?: string;
  rawCategory?: string;
  requiresPaidPlan?: boolean;
  liveSupported?: boolean;
}

export interface LiveTranscribeInput {
  audioChunk: Blob | ArrayBuffer | Uint8Array;
  mimeType?: string;
  language?: string;
}

export interface ConfigChatResponse {
  response: string;
  extractedFields: Record<string, unknown>;
  isComplete: boolean;
  readinessScore: number;
  metadata: { provider: string; latencyMs: number };
}

export const onboardingApi = createApi({
  reducerPath: 'onboardingApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['OnboardingStatus', 'Readiness'],
  endpoints: (builder) => ({
    getOnboardingStatus: builder.query<OnboardingStatus, void>({
      query: () => '/onboarding/status',
      providesTags: ['OnboardingStatus'],
    }),

    getReadiness: builder.query<ReadinessScorecard, void>({
      query: () => '/onboarding/readiness',
      providesTags: ['Readiness'],
    }),

    getAvailableVoices: builder.query<{ data: AvailableVoiceOption[] }, void>({
      query: () => '/onboarding/voices',
    }),

    saveClinicProfile: builder.mutation<{ success: boolean; step: string }, ClinicProfileInput>({
      query: (data) => ({
        url: '/onboarding/clinic-profile',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['OnboardingStatus', 'Readiness'],
    }),

    saveServices: builder.mutation<{ success: boolean; step: string }, { services: ServiceInput[] }>({
      query: (data) => ({
        url: '/onboarding/services',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['OnboardingStatus', 'Readiness'],
    }),

    saveBookingRules: builder.mutation<{ success: boolean; step: string }, BookingRulesInput>({
      query: (data) => ({
        url: '/onboarding/booking-rules',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['OnboardingStatus', 'Readiness'],
    }),

    savePolicies: builder.mutation<{ success: boolean; step: string }, { policies: PolicyInput[] }>({
      query: (data) => ({
        url: '/onboarding/policies',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['OnboardingStatus', 'Readiness'],
    }),

    saveVoiceProfile: builder.mutation<{ success: boolean; step: string }, VoiceProfileInput>({
      query: (data) => ({
        url: '/onboarding/voice',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['OnboardingStatus', 'Readiness'],
    }),

    saveFaqs: builder.mutation<{ success: boolean; step: string }, { faqs: FaqInput[] }>({
      query: (data) => ({
        url: '/onboarding/faqs',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['OnboardingStatus', 'Readiness'],
    }),

    generateVoicePreview: builder.mutation<string, VoicePreviewInput>({
      queryFn: async (arg) => {
        try {
          const buildHeaders = (): HeadersInit => ({
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          });

          let res = await fetch(`${API_BASE_URL}/onboarding/voice-preview`, {
            method: 'POST',
            headers: buildHeaders(),
            body: JSON.stringify(arg),
          });

          if (res.status === 401) {
            const refreshed = await tryRefreshAccessToken();
            if (refreshed) {
              res = await fetch(`${API_BASE_URL}/onboarding/voice-preview`, {
                method: 'POST',
                headers: buildHeaders(),
                body: JSON.stringify(arg),
              });
            }
          }

          if (!res.ok) {
            const errorText = await res.text();
            return { error: { status: res.status, data: errorText } as const };
          }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          return { data: url };
        } catch (err) {
          return { error: { status: 'FETCH_ERROR' as const, error: String(err) } };
        }
      },
    }),

    transcribeLiveAudio: builder.mutation<string, LiveTranscribeInput>({
      queryFn: async ({ audioChunk, mimeType = 'audio/webm', language = 'en' }) => {
        try {
          const buildHeaders = (): HeadersInit => ({
            'Content-Type': mimeType,
            ...getAuthHeaders(),
          });

          const requestBody: BodyInit =
            audioChunk instanceof Blob
              ? audioChunk
              : audioChunk instanceof ArrayBuffer
                ? audioChunk
                : (audioChunk.buffer.slice(
                    audioChunk.byteOffset,
                    audioChunk.byteOffset + audioChunk.byteLength,
                  ) as ArrayBuffer);

          const url = `${API_BASE_URL}/onboarding/live-transcribe?language=${encodeURIComponent(language)}`;

          let res = await fetch(url, {
            method: 'POST',
            headers: buildHeaders(),
            body: requestBody,
          });

          if (res.status === 401) {
            const refreshed = await tryRefreshAccessToken();
            if (refreshed) {
              res = await fetch(url, {
                method: 'POST',
                headers: buildHeaders(),
                body: requestBody,
              });
            }
          }

          if (!res.ok) {
            const errorText = await res.text();
            return { error: { status: res.status, data: errorText } as const };
          }

          const payload = (await res.json()) as { transcript?: string };
          return { data: payload.transcript?.trim() ?? '' };
        } catch (err) {
          return { error: { status: 'FETCH_ERROR' as const, error: String(err) } };
        }
      },
    }),

    publishConfig: builder.mutation<{ configVersionId: string }, void>({
      query: () => ({
        url: '/onboarding/publish',
        method: 'POST',
      }),
      invalidatesTags: ['OnboardingStatus', 'Readiness'],
    }),

    saveContextDocuments: builder.mutation<
      { success: boolean; count: number },
      { documents: ContextDocumentInput[] }
    >({
      query: (data) => ({
        url: '/onboarding/context-documents',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['OnboardingStatus', 'Readiness'],
    }),
  }),
});

export const {
  useGetOnboardingStatusQuery,
  useGetReadinessQuery,
  useGetAvailableVoicesQuery,
  useSaveClinicProfileMutation,
  useSaveServicesMutation,
  useSaveBookingRulesMutation,
  useSavePoliciesMutation,
  useSaveVoiceProfileMutation,
  useSaveFaqsMutation,
  useGenerateVoicePreviewMutation,
  useTranscribeLiveAudioMutation,
  usePublishConfigMutation,
  useSaveContextDocumentsMutation,
} = onboardingApi;
