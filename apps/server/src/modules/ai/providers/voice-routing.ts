const OPENAI_PRESET_VOICE_IDS = new Set([
  'pNInz6obpgDQGcFmaJgB',
  'EXAVITQu4vr4xnSDxMaL',
  'MF3mGyEYCl7XYWbV9V6O',
  '21m00Tcm4TlvDq8ikWAM',
]);

const GENERIC_TTS_VOICE_IDS = new Set([
  'default',
  'professional',
  'warm',
  'friendly',
  'calm',
  'formal',
  'casual',
  ...OPENAI_PRESET_VOICE_IDS,
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
  if (OPENAI_PRESET_VOICE_IDS.has(voiceId)) return 'openai';
  if (isCustomTtsVoiceId(voiceId)) return 'elevenlabs';
  return null;
}
