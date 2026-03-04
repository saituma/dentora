import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE_URL, applyAuthHeaders } from '@/lib/api';

// ─── Types ──────────────────────────────────────────────────────────────────

export type LlmProvider = 'openai' | 'anthropic';
export type LlmTask = 'generate_response' | 'summarize' | 'extract_intent';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ExecuteLlmRequest {
  provider: LlmProvider;
  task: LlmTask;
  payload: {
    model?: string;
    messages: LlmMessage[];
    maxTokens?: number;
    temperature?: number;
  };
}

export interface ExecuteLlmResponse {
  data: {
    response: string;
    model: string;
    provider: string;
    usage: {
      inputTokens: number;
      outputTokens: number;
    };
    latencyMs: number;
    finishReason: string;
  };
  meta: {
    task: string;
    keyResolvedVia: 'tenant' | 'platform';
    correlationId: string;
  };
}

export interface LlmProvidersResponse {
  data: {
    providers: string[];
    tasks: string[];
  };
}

// ─── Error types for structured error handling ──────────────────────────────

export interface LlmErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  correlationId?: string;
}

/**
 * Error codes the client should handle:
 * - MISSING_PROVIDER_KEY: No API key configured for the requested provider
 * - INVALID_PROVIDER: Provider name not in the whitelist
 * - TENANT_SUSPENDED: Tenant account is suspended
 * - RATE_LIMIT_EXCEEDED: Too many requests
 * - PROVIDER_ERROR: Upstream provider returned an error
 * - ALL_PROVIDERS_FAILED: All providers failed (failover exhausted)
 */
export const LLM_ERROR_CODES = {
  MISSING_PROVIDER_KEY: 'MISSING_PROVIDER_KEY',
  INVALID_PROVIDER: 'INVALID_PROVIDER',
  TENANT_SUSPENDED: 'TENANT_SUSPENDED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  ALL_PROVIDERS_FAILED: 'ALL_PROVIDERS_FAILED',
} as const;

// ─── API Key Management Types ───────────────────────────────────────────────

export interface TenantApiKey {
  id: string;
  provider: string;
  keyHint: string;
  status: string;
  label: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface StoreApiKeyRequest {
  provider: string;
  apiKey: string;
  label?: string;
  expiresAt?: string;
}

export interface StoreApiKeyResponse {
  data: {
    id: string;
    provider: string;
    keyHint: string;
    status: string;
  };
}

// ─── RTK Query API ──────────────────────────────────────────────────────────

/**
 * Client-side API for LLM execution and API key management.
 *
 * Security notes:
 * - The client NEVER sends API keys for LLM execution
 * - API keys are only sent once during storage (POST /api/api-keys)
 * - Keys are never returned in any response (only masked hints)
 * - All requests use Bearer JWT auth (via prepareHeaders)
 */
export const llmApi = createApi({
  reducerPath: 'llmApi',
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL,
    prepareHeaders: applyAuthHeaders,
  }),
  tagTypes: ['ApiKeys', 'LlmProviders'],
  endpoints: (builder) => ({
    // ─── LLM Execution ───────────────────────────────────────────────

    /**
     * Execute an LLM request. The client sends provider + task + payload.
     * The server resolves the API key automatically.
     */
    executeLlm: builder.mutation<ExecuteLlmResponse, ExecuteLlmRequest>({
      query: (body) => ({
        url: '/llm/execute',
        method: 'POST',
        body,
      }),
    }),

    /** Get available LLM providers and tasks */
    getLlmProviders: builder.query<LlmProvidersResponse, void>({
      query: () => '/llm/providers',
      providesTags: ['LlmProviders'],
    }),

    // ─── API Key Management ─────────────────────────────────────────

    /** List all configured API keys for the current tenant (masked) */
    listApiKeys: builder.query<{ data: TenantApiKey[] }, void>({
      query: () => '/api-keys',
      providesTags: ['ApiKeys'],
    }),

    /** Store a new tenant API key (the only time a raw key is sent) */
    storeApiKey: builder.mutation<StoreApiKeyResponse, StoreApiKeyRequest>({
      query: (body) => ({
        url: '/api-keys',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['ApiKeys'],
    }),

    /** Revoke an active API key for a provider */
    revokeApiKey: builder.mutation<{ message: string }, { provider: string }>({
      query: (body) => ({
        url: '/api-keys',
        method: 'DELETE',
        body,
      }),
      invalidatesTags: ['ApiKeys'],
    }),

    /** Get available providers for key configuration */
    getApiKeyProviders: builder.query<{ data: { providers: string[] } }, void>({
      query: () => '/api-keys/providers',
    }),
  }),
});

export const {
  useExecuteLlmMutation,
  useGetLlmProvidersQuery,
  useListApiKeysQuery,
  useStoreApiKeyMutation,
  useRevokeApiKeyMutation,
  useGetApiKeyProvidersQuery,
} = llmApi;
