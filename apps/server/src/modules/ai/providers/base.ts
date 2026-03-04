
export interface ProviderConfig {
  id: string;
  name: string;
  apiEndpoint: string;
  apiKey: string;
  maxConcurrency: number;
  timeoutMs: number;
}

export interface ProviderHealthState {
  status: 'healthy' | 'degraded' | 'failing';
  latencyP50Ms: number;
  latencyP95Ms: number;
  successRate: number;
  lastChecked: number;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  model: string;
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
  tenantId: string;
  callSessionId?: string;
}

export interface LlmResponse {
  content: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  finishReason: string;
}

export interface LlmProvider {
  readonly name: string;
  readonly type: 'llm';
  chat(request: LlmRequest): Promise<LlmResponse>;
}

export interface SttRequest {
  audio: Buffer | ReadableStream;
  language: string;
  model?: string;
  tenantId: string;
  callSessionId?: string;
}

export interface SttResponse {
  text: string;
  confidence: number;
  provider: string;
  latencyMs: number;
  durationMs: number;
}

export interface SttProvider {
  readonly name: string;
  readonly type: 'stt';
  transcribe(request: SttRequest): Promise<SttResponse>;
}

export interface TtsRequest {
  text: string;
  voiceId: string;
  speed?: number;
  language?: string;
  tenantId: string;
  callSessionId?: string;
}

export interface TtsResponse {
  audio: Buffer;
  provider: string;
  latencyMs: number;
  characterCount: number;
}

export interface TtsProvider {
  readonly name: string;
  readonly type: 'tts';
  synthesize(request: TtsRequest): Promise<TtsResponse>;
}

export type AnyProvider = LlmProvider | SttProvider | TtsProvider;
