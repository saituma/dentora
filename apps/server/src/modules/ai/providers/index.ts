
export * from './base.js';
export { OpenAIProvider } from './openai.js';
export { OpenAITtsProvider } from './openai-tts.js';
export { AnthropicProvider } from './anthropic.js';
export { DeepgramProvider } from './deepgram.js';
export { ElevenLabsProvider } from './elevenlabs.js';
export { GoogleSttProvider, GoogleTtsProvider } from './google.js';

import type { LlmProvider, SttProvider, TtsProvider, AnyProvider } from './base.js';
import { OpenAIProvider } from './openai.js';
import { OpenAITtsProvider } from './openai-tts.js';
import { AnthropicProvider } from './anthropic.js';
import { DeepgramProvider } from './deepgram.js';
import { ElevenLabsProvider } from './elevenlabs.js';
import { GoogleSttProvider, GoogleTtsProvider } from './google.js';

const llmAdapters: Record<string, () => LlmProvider> = {
  openai: () => new OpenAIProvider(),
  anthropic: () => new AnthropicProvider(),
};

const sttAdapters: Record<string, () => SttProvider> = {
  deepgram: () => new DeepgramProvider(),
  'google-stt': () => new GoogleSttProvider(),
};

const ttsAdapters: Record<string, () => TtsProvider> = {
  elevenlabs: () => new ElevenLabsProvider(),
  'google-tts': () => new GoogleTtsProvider(),
  openai: () => new OpenAITtsProvider(),
};

const providerInstances = new Map<string, AnyProvider>();

export function getLlmAdapter(name: string): LlmProvider {
  const key = `llm:${name}`;
  if (!providerInstances.has(key)) {
    const factory = llmAdapters[name];
    if (!factory) throw new Error(`Unknown LLM provider: ${name}`);
    providerInstances.set(key, factory());
  }
  return providerInstances.get(key) as LlmProvider;
}

export function getSttAdapter(name: string): SttProvider {
  const key = `stt:${name}`;
  if (!providerInstances.has(key)) {
    const factory = sttAdapters[name];
    if (!factory) throw new Error(`Unknown STT provider: ${name}`);
    providerInstances.set(key, factory());
  }
  return providerInstances.get(key) as SttProvider;
}

export function getTtsAdapter(name: string): TtsProvider {
  const key = `tts:${name}`;
  if (!providerInstances.has(key)) {
    const factory = ttsAdapters[name];
    if (!factory) throw new Error(`Unknown TTS provider: ${name}`);
    providerInstances.set(key, factory());
  }
  return providerInstances.get(key) as TtsProvider;
}

export function listAvailableLlm(): string[] {
  return Object.keys(llmAdapters);
}

export function listAvailableStt(): string[] {
  return Object.keys(sttAdapters);
}

export function listAvailableTts(): string[] {
  return Object.keys(ttsAdapters);
}

export function clearProviderCache(): void {
  providerInstances.clear();
}
