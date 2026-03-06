export type ReceptionistVoiceGender = 'female' | 'male';
export type ReceptionistVoiceAccent = 'us' | 'uk';
export type ReceptionistVoiceTone = 'professional' | 'warm' | 'friendly' | 'calm';

export interface ReceptionistVoiceOption {
  id: string;
  name: string;
  tone: string;
  toneValue: ReceptionistVoiceTone;
  description: string;
  gender: ReceptionistVoiceGender;
  accent: ReceptionistVoiceAccent;
  locale: 'en-US' | 'en-GB';
}

export const RECEPTIONIST_VOICE_OPTIONS: ReceptionistVoiceOption[] = [
  {
    id: 'pNInz6obpgDQGcFmaJgB',
    name: 'James',
    tone: 'Professional',
    toneValue: 'professional',
    description: 'US accent, male voice. Clear and dependable for front-desk calls.',
    gender: 'male',
    accent: 'us',
    locale: 'en-US',
  },
  {
    id: 'EXAVITQu4vr4xnSDxMaL',
    name: 'Ava',
    tone: 'Friendly',
    toneValue: 'friendly',
    description: 'US accent, female voice. Warm and upbeat for everyday patient calls.',
    gender: 'female',
    accent: 'us',
    locale: 'en-US',
  },
  {
    id: 'MF3mGyEYCl7XYWbV9V6O',
    name: 'Oliver',
    tone: 'Calm',
    toneValue: 'calm',
    description: 'UK accent, male voice. Smooth and composed for a polished clinic tone.',
    gender: 'male',
    accent: 'uk',
    locale: 'en-GB',
  },
  {
    id: '21m00Tcm4TlvDq8ikWAM',
    name: 'Charlotte',
    tone: 'Warm',
    toneValue: 'warm',
    description: 'UK accent, female voice. Friendly and reassuring with a softer delivery.',
    gender: 'female',
    accent: 'uk',
    locale: 'en-GB',
  },
];

export function getReceptionistVoiceById(voiceId?: string | null): ReceptionistVoiceOption | null {
  if (!voiceId) return null;
  return RECEPTIONIST_VOICE_OPTIONS.find((voice) => voice.id === voiceId) ?? null;
}

export function getReceptionistVoiceByAccentAndGender(
  accent: ReceptionistVoiceAccent,
  gender: ReceptionistVoiceGender,
): ReceptionistVoiceOption {
  return RECEPTIONIST_VOICE_OPTIONS.find((voice) => voice.accent === accent && voice.gender === gender)
    ?? RECEPTIONIST_VOICE_OPTIONS[0];
}
