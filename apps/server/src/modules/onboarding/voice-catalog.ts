import { env } from '../../config/env.js';
import { ValidationError } from '../../lib/errors.js';
import type { AvailableVoiceOption } from './types.js';

const PREFERRED_ELEVENLABS_VOICE_IDS = [
  '7aMcdLeWslXSj6o3RLB6',
  'lcMyyd2HUfFzxdCaC4Ta',
  'sLfduly0sixkh8riDzed',
] as const;

function normalizeVoiceMetadataValue(value?: string | null): string {
  return String(value ?? '').trim().toLowerCase();
}

function includesVoiceToken(values: Array<string | null | undefined>, tokens: string[]): boolean {
  const searchable = values.map(normalizeVoiceMetadataValue).filter(Boolean).join(' ');
  return Boolean(searchable) && tokens.some((token) => searchable.includes(token));
}

function isAgentReadyVoice(input: {
  name?: string;
  category?: string;
  useCase?: string;
  description?: string;
}): boolean {
  return includesVoiceToken(
    [input.name, input.category, input.useCase, input.description],
    ['agent', 'chat', 'conversational', 'customer support', 'customer service', 'assistant', 'phone', 'ivr', 'receptionist'],
  );
}

function isCreatorStyleVoice(input: {
  name?: string;
  category?: string;
  useCase?: string;
  description?: string;
}): boolean {
  return includesVoiceToken(
    [input.name, input.category, input.useCase, input.description],
    ['youtube', 'youtuber', 'social media', 'podcast', 'narration', 'narrator', 'audiobook', 'storytelling', 'character', 'gaming', 'advertisement', 'commercial', 'promo'],
  );
}

function isUkAccentVoice(input: {
  name?: string;
  category?: string;
  useCase?: string;
  description?: string;
  accent?: string;
  locale?: string;
}): boolean {
  return includesVoiceToken(
    [input.name, input.category, input.useCase, input.description, input.accent, input.locale],
    ['en-gb', 'en_gb', 'en-uk', 'british', 'united kingdom', 'england', 'english', 'london', 'scottish', 'wales', 'welsh'],
  );
}

export async function listAvailableVoices(): Promise<AvailableVoiceOption[]> {
  if (!env.ELEVENLABS_API_KEY) {
    throw new ValidationError('ELEVENLABS_API_KEY is required to load available voices');
  }

  const response = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new ValidationError(`Failed to load ElevenLabs voices: ${errorBody.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    voices?: Array<{
      voice_id?: string;
      name?: string;
      preview_url?: string;
      category?: string;
      labels?: Record<string, string>;
      description?: string;
    }>;
  };

  const allVoices = (payload.voices ?? [])
    .filter((voice) => typeof voice.voice_id === 'string' && typeof voice.name === 'string')
    .map((voice) => {
      const labels = voice.labels ?? {};
      const gender = labels.gender || labels.gender_identity || undefined;
      const accent = labels.accent || undefined;
      const locale = labels.language || labels.locale || undefined;
      const useCase = labels.use_case || undefined;
      const category = useCase || voice.category || undefined;
      const rawCategory = voice.category || undefined;
      const requiresPaidPlan = rawCategory === 'library';
      const parts = [gender, accent || locale, category].filter(Boolean);

      return {
        voiceId: voice.voice_id as string,
        name: voice.name as string,
        label: parts.length > 0 ? parts.join(' • ') : 'ElevenLabs voice',
        previewUrl: voice.preview_url || undefined,
        gender,
        accent,
        locale,
        category,
        rawCategory,
        requiresPaidPlan,
        liveSupported: !requiresPaidPlan,
        useCase,
        description: voice.description || labels.description || undefined,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const agentReadyVoices = allVoices.filter((voice) => isAgentReadyVoice(voice) && !isCreatorStyleVoice(voice));
  const ukAgentReadyVoices = agentReadyVoices.filter((voice) => isUkAccentVoice(voice));
  const creatorFilteredVoices = allVoices.filter((voice) => !isCreatorStyleVoice(voice));
  const ukCreatorFilteredVoices = creatorFilteredVoices.filter((voice) => isUkAccentVoice(voice));

  const preferredVoices = ukAgentReadyVoices.length > 0
    ? ukAgentReadyVoices
    : ukCreatorFilteredVoices.length > 0
      ? ukCreatorFilteredVoices
      : agentReadyVoices.length > 0
        ? agentReadyVoices
        : creatorFilteredVoices.length > 0
          ? creatorFilteredVoices
          : allVoices;

  const livePreferredVoices = preferredVoices.filter((voice) => voice.liveSupported !== false);
  const paidPreferredVoices = preferredVoices.filter((voice) => voice.liveSupported === false);
  const remainingLiveVoices = allVoices.filter(
    (voice) => voice.liveSupported !== false && !preferredVoices.some((preferred) => preferred.voiceId === voice.voiceId),
  );
  const remainingPaidVoices = allVoices.filter(
    (voice) => voice.liveSupported === false && !preferredVoices.some((preferred) => preferred.voiceId === voice.voiceId),
  );

  const explicitlyPreferredVoices = PREFERRED_ELEVENLABS_VOICE_IDS
    .map((voiceId) => livePreferredVoices.find((voice) => voice.voiceId === voiceId))
    .filter((voice): voice is NonNullable<typeof voice> => Boolean(voice));

  const orderedVoices = [
    ...explicitlyPreferredVoices,
    ...livePreferredVoices.filter((voice) => !explicitlyPreferredVoices.some((preferred) => preferred.voiceId === voice.voiceId)),
    ...paidPreferredVoices,
    ...remainingLiveVoices,
    ...remainingPaidVoices,
  ];

  return orderedVoices.map(({ useCase: _useCase, description: _description, ...voice }) => voice);
}
