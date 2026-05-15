import type { Job } from 'bullmq';
import { attributeCallCost } from '../modules/calls/call.service.js';
import { logger } from '../lib/logger.js';

export type CostAttributionJobData = {
  tenantId: string;
  callSessionId: string;
  durationSeconds: number;
  aiResponseChars: number;
  turnCount: number;
};

// Per-unit cost constants (USD)
const TWILIO_PER_MIN = 0.0085; // inbound voice, UK local number
const DEEPGRAM_PER_MIN = 0.0043; // Nova-2 streaming STT
const ELEVENLABS_PER_1K_CHARS = 0.3; // Turbo v2, before phrase cache discount
const PHRASE_CACHE_HIT_RATE = 0.8; // phrase cache absorbs ~80% of ElevenLabs chars
const OPENAI_INPUT_PER_1K_TOKENS = 0.0025; // GPT-4o
const OPENAI_OUTPUT_PER_1K_TOKENS = 0.01;

export async function processCostAttribution(job: Job<CostAttributionJobData>): Promise<void> {
  const { tenantId, callSessionId, durationSeconds, aiResponseChars, turnCount } = job.data;

  const durationMins = durationSeconds / 60;

  // Estimate OpenAI tokens: ~4 chars per token, both directions
  const estimatedInputTokens = (turnCount * 200) / 4; // system prompt + history per turn
  const estimatedOutputTokens = aiResponseChars / 4;

  // ElevenLabs: phrase cache absorbs 80% of chars
  const billableElevenLabsChars = aiResponseChars * (1 - PHRASE_CACHE_HIT_RATE);

  const lineItems = [
    {
      provider: 'twilio',
      service: 'voice-inbound',
      units: Math.ceil(durationMins),
      unitCost: TWILIO_PER_MIN.toFixed(6),
      totalCost: (durationMins * TWILIO_PER_MIN).toFixed(6),
      metadata: { durationSeconds },
    },
    {
      provider: 'deepgram',
      service: 'nova-2-streaming',
      units: Math.ceil(durationMins),
      unitCost: DEEPGRAM_PER_MIN.toFixed(6),
      totalCost: (durationMins * DEEPGRAM_PER_MIN).toFixed(6),
      metadata: { durationSeconds },
    },
    {
      provider: 'elevenlabs',
      service: 'turbo-v2-tts',
      units: Math.ceil(billableElevenLabsChars),
      unitCost: (ELEVENLABS_PER_1K_CHARS / 1000).toFixed(8),
      totalCost: ((billableElevenLabsChars / 1000) * ELEVENLABS_PER_1K_CHARS).toFixed(6),
      metadata: { totalChars: aiResponseChars, phrasesCacheHitRate: PHRASE_CACHE_HIT_RATE },
    },
    {
      provider: 'openai',
      service: 'gpt-4o',
      units: Math.ceil(estimatedInputTokens + estimatedOutputTokens),
      unitCost: (OPENAI_INPUT_PER_1K_TOKENS / 1000).toFixed(8),
      totalCost: (
        (estimatedInputTokens / 1000) * OPENAI_INPUT_PER_1K_TOKENS +
        (estimatedOutputTokens / 1000) * OPENAI_OUTPUT_PER_1K_TOKENS
      ).toFixed(6),
      metadata: { estimatedInputTokens, estimatedOutputTokens, turnCount },
    },
  ].filter((item) => parseFloat(item.totalCost) > 0);

  await attributeCallCost({ tenantId, callSessionId, lineItems });

  const totalCost = lineItems.reduce((sum, i) => sum + parseFloat(i.totalCost), 0);
  logger.info(
    { tenantId, callSessionId, totalCostUsd: totalCost.toFixed(6), durationSeconds },
    'Cost attribution complete',
  );
}
