import type { MicrophoneDiagnosticsResult } from '@/lib/microphone-diagnostics';

export type ChatTurn = { speaker: 'caller' | 'receptionist'; text: string; ts: string };
export type QueuedTtsSegment = { text: string; audioUrlPromise: Promise<string> };

export const INITIAL_MIC_DIAGNOSTICS: MicrophoneDiagnosticsResult = {
  status: 'permission-required',
  permission: 'prompt',
  devices: [],
  detectedDevices: 'unknown',
  selectedDeviceId: '',
  selectedDeviceLabel: 'None',
};

export const TONE_TO_VOICE_ID: Record<string, string> = {
  professional: 'pNInz6obpgDQGcFmaJgB',
  warm: '21m00Tcm4TlvDq8ikWAM',
  friendly: 'EXAVITQu4vr4xnSDxMaL',
  calm: 'MF3mGyEYCl7XYWbV9V6O',
  formal: 'pNInz6obpgDQGcFmaJgB',
  casual: 'EXAVITQu4vr4xnSDxMaL',
};

export const LIVE_AUDIO_RECORDER_MIME_TYPE = 'audio/webm;codecs=opus';
export const VAD_SILENCE_THRESHOLD = 14;
export const BARGE_IN_THRESHOLD = 22;
export const SILENCE_MS_BEFORE_SEND = 300;
export const SILENCE_MS_BEFORE_IDLE = 1500;
export const LIVE_AUDIO_UPLOAD_MIME_TYPE = 'audio/webm';
export const MIN_LIVE_AUDIO_BYTES = 1024;
export const MAX_LIVE_AUDIO_CHUNK_BYTES = 1024 * 1024;
export const EARLY_TTS_MIN_CHARS = 24;
export const EARLY_TTS_CLAUSE_MIN_CHARS = 36;
export const EARLY_TTS_LONG_PHRASE_MIN_CHARS = 72;
export const LIVE_AUDIO_RECORD_TIMESLICE_MS = 650;
export const POST_ASSISTANT_AUDIO_COOLDOWN_MS = 900;
export const ASSISTANT_ECHO_WINDOW_MS = 30000;
