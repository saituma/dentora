const OPENAI_BUILTIN_VOICE_IDS = new Set([
  'alloy',
  'echo',
  'nova',
  'sage',
  'shimmer',
]);

const GENERIC_TTS_VOICE_IDS = new Set([
  'default',
  'professional',
  'warm',
  'friendly',
  'calm',
  'formal',
  'casual',
  ...OPENAI_BUILTIN_VOICE_IDS,
]);

export function isGenericTtsVoiceId(voiceId?: string | null): boolean {
  if (!voiceId) return true;
  return GENERIC_TTS_VOICE_IDS.has(voiceId);
}

export function isCustomTtsVoiceId(voiceId?: string | null): boolean {
  return !isGenericTtsVoiceId(voiceId);
}

export function getPreferredTtsProviderForVoiceId(voiceId?: string | null): 'openai' | 'elevenlabs' | null {
  if (!voiceId) return null;
  if (OPENAI_BUILTIN_VOICE_IDS.has(voiceId)) return 'openai';
  if (isCustomTtsVoiceId(voiceId)) return 'elevenlabs';
  return null;
}
