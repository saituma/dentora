'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { MicIcon, PhoneCallIcon, PhoneOffIcon } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { MicrophoneDiagnosticsPanel } from '@/components/microphone-diagnostics-panel';
import { useGetVoiceProfileQuery } from '@/features/aiConfig/aiConfigApi';
import {
  useGetAvailableVoicesQuery,
  useGenerateVoicePreviewMutation,
  useTranscribeLiveAudioMutation,
} from '@/features/onboarding/onboardingApi';
import {
  runMicrophoneDiagnostics,
  type MicrophoneDiagnosticsResult,
} from '@/lib/microphone-diagnostics';
import { getAudioConstraints } from '@/lib/audio-constraints';
import { getUserFriendlyApiError } from '@/lib/api-error';
import { API_BASE_URL, ensureFreshAccessToken, getAuthHeaders, tryRefreshAccessToken } from '@/lib/api';

type ChatTurn = { speaker: 'caller' | 'receptionist'; text: string; ts: string };
type QueuedTtsSegment = { text: string; audioUrlPromise: Promise<string> };

const INITIAL_MIC_DIAGNOSTICS: MicrophoneDiagnosticsResult = {
  status: 'permission-required',
  permission: 'prompt',
  devices: [],
  detectedDevices: 'unknown',
  selectedDeviceId: '',
  selectedDeviceLabel: 'None',
};

const TONE_TO_VOICE_ID: Record<string, string> = {
  professional: 'pNInz6obpgDQGcFmaJgB',
  warm: '21m00Tcm4TlvDq8ikWAM',
  friendly: 'EXAVITQu4vr4xnSDxMaL',
  calm: 'MF3mGyEYCl7XYWbV9V6O',
  formal: 'pNInz6obpgDQGcFmaJgB',
  casual: 'EXAVITQu4vr4xnSDxMaL',
};

const LIVE_AUDIO_RECORDER_MIME_TYPE = 'audio/webm;codecs=opus';
/** VAD: level below this is treated as silence (reduces "stuck listening" from background noise). */
const VAD_SILENCE_THRESHOLD = 14;
const BARGE_IN_THRESHOLD = 22;
/** Ms of silence before sending buffered utterance (shorter = faster send). */
const SILENCE_MS_BEFORE_SEND = 300;
/** Ms of silence before showing Idle (stop "Listening" state). */
const SILENCE_MS_BEFORE_IDLE = 1500;
const LIVE_AUDIO_UPLOAD_MIME_TYPE = 'audio/webm';
const MIN_LIVE_AUDIO_BYTES = 1024;
const MAX_LIVE_AUDIO_CHUNK_BYTES = 1024 * 1024;
/** Min chars before sending first chunk to TTS (lower = faster first audio). */
const EARLY_TTS_MIN_CHARS = 24;
const EARLY_TTS_CLAUSE_MIN_CHARS = 36;
const EARLY_TTS_LONG_PHRASE_MIN_CHARS = 72;
/** Record in short chunks so we send to STT sooner without hurting STT accuracy too much. */
const LIVE_AUDIO_RECORD_TIMESLICE_MS = 650;
const POST_ASSISTANT_AUDIO_COOLDOWN_MS = 900;
const ASSISTANT_ECHO_WINDOW_MS = 30000;

export default function TestAiReceptionistPage() {
  const { data: voiceProfile } = useGetVoiceProfileQuery();
  const { data: availableVoicesData } = useGetAvailableVoicesQuery();

  const [generateVoicePreview, { isLoading: isSpeaking }] = useGenerateVoicePreviewMutation();
  const [transcribeLiveAudio, { isLoading: isTranscribing }] = useTranscribeLiveAudioMutation();

  const [isCallActive, setIsCallActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [micDiagnostics, setMicDiagnostics] = useState<MicrophoneDiagnosticsResult>(INITIAL_MIC_DIAGNOSTICS);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
  const [isStreamingResponse, setIsStreamingResponse] = useState(false);
  const [audioSource, setAudioSource] = useState<'elevenlabs' | 'configured-preview' | 'browser-fallback' | 'unavailable' | 'unknown'>('unknown');
  const [voiceWarning, setVoiceWarning] = useState<string | null>(null);
  const [liveVoiceId, setLiveVoiceId] = useState<string | null>(null);
  const [liveVoiceName, setLiveVoiceName] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const fallbackSilenceTimerRef = useRef<number | null>(null);
  const transcriptionSessionRef = useRef(0);
  const utteranceAudioChunksRef = useRef<Blob[]>([]);
  const utteranceAudioBytesRef = useRef(0);
  const transcribeErrorShownRef = useRef(false);
  const aiRespondingRef = useRef(false);
  const pendingTranscriptionsRef = useRef(0);
  const isCallActiveRef = useRef(false);
  const turnsRef = useRef<ChatTurn[]>([]);
  const oversizedChunkWarningShownRef = useRef(false);
  const streamForRecorderRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadIntervalRef = useRef<number | null>(null);
  const userSilentSinceRef = useRef<number | null>(null);
  const voiceDetectedRef = useRef(false);
  const ttsQueueRef = useRef<QueuedTtsSegment[]>([]);
  const isProcessingTtsQueueRef = useRef(false);
  const ttsAccumulatorRef = useRef('');
  const ttsDrainResolversRef = useRef<Array<() => void>>([]);
  const browserSpeechPendingCountRef = useRef(0);
  const browserSpeechDrainResolversRef = useRef<Array<() => void>>([]);
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
  const speechRecognitionRestartTimerRef = useRef<number | null>(null);
  const shouldRestartSpeechRecognitionRef = useRef(false);
  const liveSocketRef = useRef<WebSocket | null>(null);
  const currentAssistantTurnTsRef = useRef<string | null>(null);
  const lastLiveTranscriptRef = useRef('');
  const lastLiveTranscriptAtRef = useRef(0);
  const lastAssistantUtteranceRef = useRef('');
  const lastAssistantUtteranceAtRef = useRef(0);
  const browserTtsVoiceUriRef = useRef<string | null>(null);
  const shouldAutoEndCallRef = useRef(false);
  const resumeVoiceInputAtRef = useRef(0);
  const configuredVoicePreviewDisabledRef = useRef(false);
  const configuredVoicePreviewAuthToastShownRef = useRef(false);

  const hasMediaRecorder = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined';
  const supportsWebmOpus = hasMediaRecorder && MediaRecorder.isTypeSupported(LIVE_AUDIO_RECORDER_MIME_TYPE);
  const supportsBrowserSpeechRecognition =
    typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const canUseUploadFallback = hasMediaRecorder && supportsWebmOpus;

  const speechSupportReason = !hasMediaRecorder
    ? 'Live microphone capture is unavailable in this browser. Use Chrome/Edge/Firefox on HTTPS or localhost.'
    : !supportsWebmOpus
      ? 'This browser does not support audio/webm;codecs=opus live capture required for real-time transcription.'
      : null;

  const selectedVoiceId =
    voiceProfile?.voiceId || TONE_TO_VOICE_ID[voiceProfile?.tone ?? 'professional'] || TONE_TO_VOICE_ID.professional;
  const availableVoices = availableVoicesData?.data ?? [];
  const selectedVoice = availableVoices.find((voice) => voice.voiceId === selectedVoiceId) ?? null;
  const liveVoice = availableVoices.find((voice) => voice.voiceId === liveVoiceId) ?? null;
  const liveVoiceOverride = selectedVoice?.liveSupported === false
    ? availableVoices.find((voice) => voice.liveSupported !== false) ?? null
    : null;
  const receptionistDisplayName =
    audioSource === 'elevenlabs' || audioSource === 'configured-preview'
      ? (liveVoiceName?.trim() || liveVoice?.name?.trim() || selectedVoice?.name?.trim() || 'AI Receptionist')
      : audioSource === 'browser-fallback'
        ? 'Browser Voice'
        : 'AI Receptionist';

  useEffect(() => {
    isCallActiveRef.current = isCallActive;
  }, [isCallActive]);

  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  const stopVad = () => {
    if (vadIntervalRef.current !== null) {
      window.clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    userSilentSinceRef.current = null;
  };

  const clearSpeechRecognitionRestartTimer = () => {
    if (speechRecognitionRestartTimerRef.current !== null) {
      window.clearTimeout(speechRecognitionRestartTimerRef.current);
      speechRecognitionRestartTimerRef.current = null;
    }
  };

  const stopSpeechRecognition = () => {
    shouldRestartSpeechRecognitionRef.current = false;
    clearSpeechRecognitionRestartTimer();
    const recognition = speechRecognitionRef.current;
    speechRecognitionRef.current = null;
    if (recognition) {
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      recognition.onspeechstart = null;
      recognition.onspeechend = null;
      try {
        recognition.stop();
      } catch {
      }
    }
    setInterimTranscript('');
    setIsListening(false);
  };

  const stopFallbackRecorder = () => {
    if (fallbackSilenceTimerRef.current !== null) {
      window.clearTimeout(fallbackSilenceTimerRef.current);
      fallbackSilenceTimerRef.current = null;
    }

    stopVad();

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    mediaRecorderRef.current = null;

    const stream = mediaStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    mediaStreamRef.current = null;

    transcriptionSessionRef.current += 1;
    utteranceAudioChunksRef.current = [];
    utteranceAudioBytesRef.current = 0;
    setInterimTranscript('');
    setIsListening(false);
    streamForRecorderRef.current = null;
  };

  const startFallbackRecorder = async () => {
    if (!isCallActiveRef.current || mediaRecorderRef.current || !hasMediaRecorder || !supportsWebmOpus) return;

    try {
      const stream = mediaStreamRef.current ?? await navigator.mediaDevices.getUserMedia({
        audio: getAudioConstraints(micDiagnostics.selectedDeviceId || undefined),
      });
      mediaStreamRef.current = stream;
      streamForRecorderRef.current = stream;
      transcribeErrorShownRef.current = false;
      oversizedChunkWarningShownRef.current = false;

      const sendLiveAudioChunk = async (audioChunk: Blob) => {
        const socket = liveSocketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        const arrayBuffer = await audioChunk.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let index = 0; index < bytes.length; index += 1) {
          binary += String.fromCharCode(bytes[index]);
        }
        socket.send(JSON.stringify({
          event: 'audio_chunk',
          mimeType: LIVE_AUDIO_UPLOAD_MIME_TYPE,
          audioBase64: btoa(binary),
          language: 'en-US',
        }));
      };

      const sendBufferedUtterance = async () => {
        if (aiRespondingRef.current) return;
        if (supportsBrowserSpeechRecognition && isLiveSocketOpen()) {
          utteranceAudioChunksRef.current = [];
          utteranceAudioBytesRef.current = 0;
          return;
        }
        if (utteranceAudioBytesRef.current < MIN_LIVE_AUDIO_BYTES) return;

        if (fallbackSilenceTimerRef.current !== null) {
          window.clearTimeout(fallbackSilenceTimerRef.current);
          fallbackSilenceTimerRef.current = null;
        }

        if (isLiveSocketOpen() && !supportsBrowserSpeechRecognition) {
          liveSocketRef.current?.send(JSON.stringify({ event: 'flush_audio' }));
          utteranceAudioBytesRef.current = 0;
          setInterimTranscript('Transcribing...');
          setIsListening(false);
          return;
        }

        const transcriptionSessionId = transcriptionSessionRef.current;
        const audioChunks = utteranceAudioChunksRef.current;
        const utteranceBlob = new Blob(audioChunks, { type: LIVE_AUDIO_UPLOAD_MIME_TYPE });
        utteranceAudioChunksRef.current = [];
        utteranceAudioBytesRef.current = 0;
        setInterimTranscript('Transcribing...');
        setIsListening(false);
        pendingTranscriptionsRef.current++;

        try {
          const utterance = (await transcribeLiveAudio({
            audioChunk: utteranceBlob,
            mimeType: LIVE_AUDIO_UPLOAD_MIME_TYPE,
            language: 'en-US',
          }).unwrap()).trim();

          if (
            transcriptionSessionId !== transcriptionSessionRef.current ||
            aiRespondingRef.current ||
            !isCallActiveRef.current
          ) {
            return;
          }

          if (!utterance || utterance.length < 2) return;
          await sendCallerUtterance(utterance);
        } catch (error) {
          if (!transcribeErrorShownRef.current) {
            transcribeErrorShownRef.current = true;
            toast.error(getUserFriendlyApiError(error));
          }
        } finally {
          pendingTranscriptionsRef.current--;
        }
      };

      try {
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        audioContextRef.current = ctx;
        analyserRef.current = analyser;

        const freqData = new Uint8Array(analyser.frequencyBinCount);
        vadIntervalRef.current = window.setInterval(() => {
          if (!analyserRef.current || !isCallActiveRef.current) return;
          analyserRef.current.getByteFrequencyData(freqData);
          const avg = freqData.reduce((a, b) => a + b, 0) / freqData.length;

          if (avg >= 18) {
            if (aiRespondingRef.current && avg >= BARGE_IN_THRESHOLD && isLiveSocketOpen()) {
              liveSocketRef.current?.send(JSON.stringify({ event: 'barge_in' }));
              clearAudioPlayback();
              aiRespondingRef.current = false;
              setIsStreamingResponse(false);
            }
            voiceDetectedRef.current = true;
            userSilentSinceRef.current = null;
            setIsListening(true);
            return;
          }

          if (avg < VAD_SILENCE_THRESHOLD) {
            const now = Date.now();
            if (userSilentSinceRef.current === null) {
              userSilentSinceRef.current = now;
            } else {
              const silentMs = now - userSilentSinceRef.current;
              if (silentMs >= SILENCE_MS_BEFORE_SEND) void sendBufferedUtterance();
              if (silentMs >= SILENCE_MS_BEFORE_IDLE) {
                setIsListening(false);
                setInterimTranscript('');
              }
            }
          } else {
            userSilentSinceRef.current = null;
          }
        }, 100);
      } catch {
        // AudioContext unavailable; timer-based silence detection is used as fallback
      }

      const startNewRecorder = () => {
        if (!isCallActiveRef.current || !streamForRecorderRef.current) {
          setIsListening(false);
          return;
        }
        const r = new MediaRecorder(streamForRecorderRef.current, {
          mimeType: LIVE_AUDIO_RECORDER_MIME_TYPE,
        });
        r.ondataavailable = (event) => {
          if (!isCallActiveRef.current) return;
          if (!event.data || event.data.size === 0) return;
          if (event.data.size > MAX_LIVE_AUDIO_CHUNK_BYTES) {
            if (!oversizedChunkWarningShownRef.current) {
              oversizedChunkWarningShownRef.current = true;
              toast.warning('Microphone chunk too large; skipped.');
            }
            return;
          }
          const hadVoice = voiceDetectedRef.current;
          voiceDetectedRef.current = false;
          if (hadVoice) {
            if (aiRespondingRef.current) {
              setInterimTranscript('');
              setIsListening(false);
              r.stop();
              return;
            }
            setInterimTranscript('Listening...');
            if (supportsBrowserSpeechRecognition && isLiveSocketOpen()) {
              // Browser speech recognition is the authoritative transcript path in supported browsers.
            } else if (isLiveSocketOpen() && !supportsBrowserSpeechRecognition) {
              utteranceAudioBytesRef.current += event.data.size;
              void sendLiveAudioChunk(event.data);
            } else {
              utteranceAudioBytesRef.current += event.data.size;
              utteranceAudioChunksRef.current.push(event.data);
            }
          }
          r.stop();
        };
        r.onstop = () => {
          if (isCallActiveRef.current && streamForRecorderRef.current) {
            startNewRecorder();
          } else {
            setIsListening(false);
          }
        };
        mediaRecorderRef.current = r;
        r.start(LIVE_AUDIO_RECORD_TIMESLICE_MS);
      };

      startNewRecorder();
      setIsListening(true);
    } catch {
      toast.error('Microphone access failed. Allow mic permissions to run live call tests.');
      await runDiagnostics(false);
    }
  };

  const runDiagnostics = useCallback(async (requestPermission: boolean) => {
    setIsRunningDiagnostics(true);
    try {
      const result = await runMicrophoneDiagnostics({
        requestPermission,
        preferredDeviceId: micDiagnostics.selectedDeviceId,
      });
      setMicDiagnostics(result);
      return result;
    } finally {
      setIsRunningDiagnostics(false);
    }
  }, [micDiagnostics.selectedDeviceId]);

  const requestMicrophonePermission = async (): Promise<boolean> => {
    const result = await runDiagnostics(true);
    if (result.status === 'ready') {
      toast.success('Microphone enabled.');
      return true;
    }

    if (result.status === 'permission-required') {
      toast.error('Microphone permission is required. Allow it from browser site settings.');
      return false;
    }

    if (result.status === 'no-microphone-detected') {
      if (result.permission === 'granted') {
        toast.warning('Microphone permission is granted, but device detection is unstable. Starting call with compatibility fallback.');
        return true;
      }
      toast.error('No microphone detected. Plug in a microphone and retry.');
      return false;
    }

    if (result.status === 'device-busy') {
      toast.error('Microphone is busy or blocked. Close other apps using it, then retry.');
      return false;
    }

    if (result.status === 'insecure-context') {
      toast.error('Microphone requires HTTPS or localhost.');
      return false;
    }

    toast.error('Microphone diagnostics failed. Check browser and OS permissions.');
    return false;
  };

  useEffect(() => {
    void runDiagnostics(false);
  }, [runDiagnostics]);

  const synthesizeTtsAudioUrl = useCallback(async (text: string) => {
    const toPlay = text.trim();
    if (!toPlay) throw new Error('Cannot synthesize empty TTS text');
    return generateVoicePreview({
      voiceId: selectedVoiceId,
      text: toPlay,
      speed: voiceProfile?.speechSpeed ?? 1,
    }).unwrap();
  }, [generateVoicePreview, selectedVoiceId, voiceProfile?.speechSpeed]);

  const playTtsAudioUrl = useCallback(async (audioUrl: string) => {
    try {
      // Unlock playback: resume input AudioContext so tab is treated as having audio (helps autoplay)
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = audioUrl;
      await audioRef.current.play();
      await new Promise<void>((resolve) => {
        audioRef.current!.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
      });
    } catch (err) {
      const isAutoplay = err instanceof Error && err.name === 'NotAllowedError';
      toast.error(isAutoplay ? 'Click the page to allow audio, then try again' : 'Failed to play AI voice response');
    }
  }, []);

  const resolveTtsDrain = () => {
    const resolvers = ttsDrainResolversRef.current.splice(0);
    for (const resolve of resolvers) resolve();
  };

  const resolveBrowserSpeechDrain = () => {
    if (browserSpeechPendingCountRef.current > 0) return;
    const resolvers = browserSpeechDrainResolversRef.current.splice(0);
    for (const resolve of resolvers) resolve();
  };

  const waitForTtsDrain = () => {
    if (!isProcessingTtsQueueRef.current && ttsQueueRef.current.length === 0) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      ttsDrainResolversRef.current.push(resolve);
    });
  };

  const waitForBrowserSpeechDrain = () => {
    if (browserSpeechPendingCountRef.current === 0) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      browserSpeechDrainResolversRef.current.push(resolve);
    });
  };

  const blockVoiceInputResume = (ms = POST_ASSISTANT_AUDIO_COOLDOWN_MS) => {
    const nextAllowedAt = Date.now() + ms;
    if (nextAllowedAt > resumeVoiceInputAtRef.current) {
      resumeVoiceInputAtRef.current = nextAllowedAt;
    }
  };

  const waitForVoiceInputResumeWindow = async () => {
    const waitMs = resumeVoiceInputAtRef.current - Date.now();
    if (waitMs > 0) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, waitMs);
      });
    }
  };

  const extractSpeakableSegments = (buffer: string, flushRemainder = false) => {
    const segments: string[] = [];
    let start = 0;
    let lastCommittedIndex = 0;

    for (let index = 0; index < buffer.length; index += 1) {
      const char = buffer[index];
      const currentLength = index + 1 - lastCommittedIndex;
      const isStrongBoundary = char === '.' || char === '!' || char === '?';
      const isSoftBoundary =
        (char === ',' || char === ';' || char === ':') && currentLength >= EARLY_TTS_CLAUSE_MIN_CHARS;
      const isEarlyWordBoundary =
        char === ' ' && currentLength >= EARLY_TTS_LONG_PHRASE_MIN_CHARS;

      if ((isStrongBoundary && currentLength >= EARLY_TTS_MIN_CHARS) || isSoftBoundary || isEarlyWordBoundary) {
        const segment = buffer.slice(start, index + 1).trim();
        if (segment) segments.push(segment);
        start = index + 1;
        lastCommittedIndex = start;
      }
    }

    const remainder = buffer.slice(start).trim();
    if (flushRemainder && remainder) {
      segments.push(remainder);
      return { segments, remainder: '' };
    }

    return { segments, remainder };
  };

  const processTtsQueue = useCallback(async () => {
    if (isProcessingTtsQueueRef.current) return;
    isProcessingTtsQueueRef.current = true;

    try {
      while (ttsQueueRef.current.length > 0) {
        const nextSegment = ttsQueueRef.current.shift();
        if (!nextSegment) continue;
        try {
          const audioUrl = await nextSegment.audioUrlPromise;
          await playTtsAudioUrl(audioUrl);
        } catch {
          toast.error('Failed to play AI voice response');
        }
      }
    } finally {
      isProcessingTtsQueueRef.current = false;
      if (ttsQueueRef.current.length === 0) {
        resolveTtsDrain();
      }
    }
  }, [playTtsAudioUrl]);

  const queueTtsSegments = useCallback((segments: string[]) => {
    const cleanedSegments = segments.map((segment) => segment.trim()).filter(Boolean);
    if (cleanedSegments.length === 0) return;
    ttsQueueRef.current.push(
      ...cleanedSegments.map((segment) => ({
        text: segment,
        audioUrlPromise: synthesizeTtsAudioUrl(segment),
      })),
    );
    void processTtsQueue();
  }, [processTtsQueue, synthesizeTtsAudioUrl]);

  const clearAudioPlayback = useCallback(() => {
    ttsQueueRef.current = [];
    browserSpeechPendingCountRef.current = 0;
    resolveBrowserSpeechDrain();
    if (audioRef.current) {
      const currentSrc = audioRef.current.src;
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = '';
      if (currentSrc.startsWith('blob:')) {
        URL.revokeObjectURL(currentSrc);
      }
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const queueAudioUrl = useCallback((audioUrl: string) => {
    ttsQueueRef.current.push({
      text: '',
      audioUrlPromise: Promise.resolve(audioUrl),
    });
    void processTtsQueue();
  }, [processTtsQueue]);

  const queueServerAudioSegment = useCallback((audioBase64: string, mimeType = 'audio/mpeg') => {
    const binary = atob(audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const audioUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    queueAudioUrl(audioUrl);
  }, [queueAudioUrl]);

  const playConfiguredVoiceFallback = useCallback(async (text: string) => {
    const cleaned = text.trim();
    if (!cleaned) return false;
    if (configuredVoicePreviewDisabledRef.current) return false;

    const hasAuthorization = Object.keys(getAuthHeaders()).some((header) => header.toLowerCase() === 'authorization');
    if (!hasAuthorization) {
      configuredVoicePreviewDisabledRef.current = true;
      return false;
    }

    try {
      const audioUrl = await synthesizeTtsAudioUrl(cleaned);
      queueAudioUrl(audioUrl);
      return true;
    } catch (error) {
      const status =
        typeof error === 'object' && error && 'status' in error
          ? Number((error as { status?: unknown }).status)
          : Number.NaN;
      const errorText = String(error ?? '');
      const isUnauthorized = status === 401 || /unauthorized|401/i.test(errorText);

      if (isUnauthorized) {
        configuredVoicePreviewDisabledRef.current = true;
        if (!configuredVoicePreviewAuthToastShownRef.current) {
          configuredVoicePreviewAuthToastShownRef.current = true;
          toast.info('Configured voice preview is unavailable for this session. Using browser fallback voice.');
        }
      }
      return false;
    }
  }, [queueAudioUrl, synthesizeTtsAudioUrl]);

  const speakWithBrowserSynthesis = useCallback((text: string) => {
    const cleaned = text.trim();
    if (!cleaned) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    const byStoredUri = browserTtsVoiceUriRef.current
      ? voices.find((voice) => voice.voiceURI === browserTtsVoiceUriRef.current)
      : undefined;
    const selectedBrowserVoice = byStoredUri
      ?? voices.find((voice) => voice.lang.toLowerCase() === 'en-us' && !voice.localService)
      ?? voices.find((voice) => voice.lang.toLowerCase() === 'en-us')
      ?? voices.find((voice) => voice.lang.toLowerCase().startsWith('en'))
      ?? voices.find((voice) => voice.default)
      ?? voices[0];

    if (selectedBrowserVoice?.voiceURI) {
      browserTtsVoiceUriRef.current = selectedBrowserVoice.voiceURI;
    }

    browserSpeechPendingCountRef.current += 1;
    const utterance = new SpeechSynthesisUtterance(cleaned);
    if (selectedBrowserVoice) {
      utterance.voice = selectedBrowserVoice;
      utterance.lang = selectedBrowserVoice.lang || 'en-US';
    } else {
      utterance.lang = 'en-US';
    }
    utterance.rate = voiceProfile?.speechSpeed ?? 1;

    const finish = () => {
      browserSpeechPendingCountRef.current = Math.max(0, browserSpeechPendingCountRef.current - 1);
      resolveBrowserSpeechDrain();
    };

    utterance.onend = finish;
    utterance.onerror = finish;
    synth.speak(utterance);
  }, [voiceProfile?.speechSpeed]);

  const isLiveSocketOpen = () => {
    return liveSocketRef.current?.readyState === WebSocket.OPEN;
  };

  const closeLiveSocket = () => {
    const socket = liveSocketRef.current;
    liveSocketRef.current = null;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ event: 'stop' }));
      socket.close();
    } else if (socket) {
      socket.close();
    }
  };

  const normalizeCallTranscript = (value: string) => (
    value.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
  );

  const rememberAssistantUtterance = (value: string) => {
    const normalized = normalizeCallTranscript(value);
    if (!normalized) return;
    lastAssistantUtteranceRef.current = normalized;
    lastAssistantUtteranceAtRef.current = Date.now();
  };

  const isLikelyAssistantEcho = (transcript: string): boolean => {
    const normalized = normalizeCallTranscript(transcript);
    if (!normalized) return false;

    const lastAssistant = lastAssistantUtteranceRef.current;
    if (!lastAssistant) return false;

    const heardRecently = Date.now() - lastAssistantUtteranceAtRef.current < ASSISTANT_ECHO_WINDOW_MS;
    if (!heardRecently) return false;

    const instructionPrefixPattern = /^(please|kindly|sure|absolutely|i can help|let me|can you|share|provide)\b/;
    if (instructionPrefixPattern.test(normalized) && instructionPrefixPattern.test(lastAssistant)) {
      const normalizedWords = normalized.split(' ').filter((token) => token.length > 1);
      const assistantWords = lastAssistant.split(' ').filter((token) => token.length > 1);
      const prefixLength = Math.min(6, normalizedWords.length, assistantWords.length);
      if (prefixLength >= 4) {
        const normalizedPrefix = normalizedWords.slice(0, prefixLength).join(' ');
        const assistantPrefix = assistantWords.slice(0, prefixLength).join(' ');
        if (normalizedPrefix === assistantPrefix || assistantPrefix.includes(normalizedPrefix) || normalizedPrefix.includes(assistantPrefix)) {
          return true;
        }
      }
    }

    if (normalized === lastAssistant) return true;
    if (normalized.length >= 24 && (normalized.includes(lastAssistant) || lastAssistant.includes(normalized))) {
      return true;
    }

    const transcriptWordList = normalized.split(' ').filter((token) => token.length > 2);
    const assistantWordList = lastAssistant.split(' ').filter((token) => token.length > 2);
    if (transcriptWordList.length < 3 || assistantWordList.length < 3) return false;

    const transcriptTokens = new Set(transcriptWordList);
    const assistantTokens = new Set(assistantWordList);
    const minTokenCount = Math.min(transcriptTokens.size, assistantTokens.size);

    let overlapCount = 0;
    for (const token of transcriptTokens) {
      if (assistantTokens.has(token)) overlapCount += 1;
    }

    const overlapRatio = overlapCount / minTokenCount;
    if (minTokenCount >= 3 && overlapRatio >= 0.7) {
      return true;
    }

    if (transcriptWordList.length >= 4) {
      const assistantTextWithPadding = ` ${lastAssistant} `;
      for (let index = 0; index <= transcriptWordList.length - 4; index += 1) {
        const phrase = transcriptWordList.slice(index, index + 4).join(' ');
        if (assistantTextWithPadding.includes(` ${phrase} `)) {
          return true;
        }
      }
    }

    return false;
  };

  const openLiveSocket = async (): Promise<boolean> => {
    if (isLiveSocketOpen()) return true;
    if (typeof window === 'undefined') return false;

    const token = await ensureFreshAccessToken();
    if (!token) {
      toast.error('You need to be signed in to start a live test call.');
      return false;
    }

    const socketUrl = new URL(API_BASE_URL);
    socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    socketUrl.pathname = `${socketUrl.pathname.replace(/\/api\/?$/, '')}/api/llm/receptionist-test/live`;
    socketUrl.searchParams.set('token', token);
    if (liveVoiceOverride?.voiceId) {
      socketUrl.searchParams.set('overrideVoiceId', liveVoiceOverride.voiceId);
    }

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const socket = new WebSocket(socketUrl.toString());

      const resolveOnce = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      socket.onopen = () => {
        liveSocketRef.current = socket;
      };

      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as {
          event?: string;
          sessionId?: string;
          voiceId?: string;
          voiceName?: string | null;
          configuredVoiceId?: string;
          configuredVoiceName?: string | null;
          voiceFallbackMessage?: string | null;
          state?: string;
          transcript?: string;
          text?: string;
          delta?: string;
          response?: string;
          audioBase64?: string;
          mimeType?: string;
          provider?: string;
          message?: string;
          reason?: string;
        };

        switch (message.event) {
          case 'session_ready':
            setLiveVoiceId(message.voiceId ?? null);
            setLiveVoiceName(message.voiceName ?? null);
            setVoiceWarning(message.voiceFallbackMessage ?? null);
            return;

          case 'assistant_greeting':
            aiRespondingRef.current = true;
            setIsStreamingResponse(true);
            rememberAssistantUtterance(message.text || '');
            stopSpeechRecognition();
            stopFallbackRecorder();
            setTurns([{ speaker: 'receptionist', text: message.text || '', ts: new Date().toISOString() }]);
            return;

          case 'transcription_state':
            if (message.state === 'processing') {
              setInterimTranscript('Transcribing...');
            } else if (!aiRespondingRef.current) {
              setInterimTranscript('');
            }
            return;

          case 'transcript_final': {
            const transcript = (message.transcript || '').trim();
            if (!transcript) return;
            if (isLikelyAssistantEcho(transcript)) {
              setInterimTranscript('');
              return;
            }
            const normalized = normalizeCallTranscript(transcript);
            const duplicate =
              normalized
              && normalized === lastLiveTranscriptRef.current
              && Date.now() - lastLiveTranscriptAtRef.current < 2500;
            if (duplicate) return;
            lastLiveTranscriptRef.current = normalized;
            lastLiveTranscriptAtRef.current = Date.now();
            setInterimTranscript('');
            setTurns((prev) => [...prev, { speaker: 'caller', text: transcript, ts: new Date().toISOString() }]);
            return;
          }

          case 'assistant_turn_start':
            aiRespondingRef.current = true;
            setIsStreamingResponse(true);
            currentAssistantTurnTsRef.current = new Date().toISOString();
            setTurns((prev) => [
              ...prev,
              { speaker: 'receptionist', text: '', ts: currentAssistantTurnTsRef.current! },
            ]);
            stopSpeechRecognition();
            stopFallbackRecorder();
            return;

          case 'assistant_delta':
            if (!currentAssistantTurnTsRef.current) return;
            setTurns((prev) => prev.map((turn) => (
              turn.speaker === 'receptionist' && turn.ts === currentAssistantTurnTsRef.current
                ? { ...turn, text: `${turn.text}${message.delta || ''}` }
                : turn
            )));
            return;

          case 'assistant_audio':
            if (message.audioBase64) {
              setVoiceWarning(null);
              if (message.voiceId) setLiveVoiceId(message.voiceId);
              if (message.voiceName) setLiveVoiceName(message.voiceName);
              setAudioSource(message.provider === 'elevenlabs' ? 'elevenlabs' : 'unknown');
              queueServerAudioSegment(message.audioBase64, message.mimeType || 'audio/mpeg');
              resolveOnce(true);
            }
            return;

          case 'assistant_audio_unavailable':
            if (message.text) {
              rememberAssistantUtterance(message.text);
              if (message.reason === 'paid_plan_required' && message.message) {
                setVoiceWarning(message.message);
                setAudioSource('unavailable');
                resolveOnce(true);
                return;
              }
              void playConfiguredVoiceFallback(message.text).then((usedConfiguredVoice) => {
                if (!usedConfiguredVoice) {
                  setAudioSource('browser-fallback');
                  speakWithBrowserSynthesis(message.text!);
                } else {
                  setAudioSource('configured-preview');
                }
                resolveOnce(true);
              });
            }
            return;

          case 'assistant_done': {
            const response = (message.response || '').trim();
            if (response && currentAssistantTurnTsRef.current) {
              rememberAssistantUtterance(response);
              setTurns((prev) => prev.map((turn) => (
                turn.speaker === 'receptionist' && turn.ts === currentAssistantTurnTsRef.current
                  ? { ...turn, text: response }
                  : turn
              )));
            }
            void Promise.all([waitForTtsDrain(), waitForBrowserSpeechDrain()]).then(() => {
              blockVoiceInputResume();
              if (shouldAutoEndCallRef.current) {
                shouldAutoEndCallRef.current = false;
                endCall();
                return;
              }
              aiRespondingRef.current = false;
              setIsStreamingResponse(false);
              currentAssistantTurnTsRef.current = null;
              void waitForVoiceInputResumeWindow().then(() => {
                if (!isCallActiveRef.current) return;
                if (supportsBrowserSpeechRecognition) {
                  void startSpeechRecognition();
                } else if (canUseUploadFallback) {
                  void startFallbackRecorder();
                }
              });
            });
            return;
          }

          case 'session_ended':
            shouldAutoEndCallRef.current = true;
            return;

          case 'assistant_interrupted':
            clearAudioPlayback();
            aiRespondingRef.current = false;
            setIsStreamingResponse(false);
            currentAssistantTurnTsRef.current = null;
            return;

          case 'error':
            toast.error(message.message || 'Live voice session failed');
            aiRespondingRef.current = false;
            setIsStreamingResponse(false);
            return;

          default:
        }
      };

      socket.onerror = () => {
        liveSocketRef.current = null;
        resolveOnce(false);
      };

      socket.onclose = () => {
        liveSocketRef.current = null;
        if (!settled) {
          resolveOnce(false);
          return;
        }
        if (isCallActiveRef.current) {
          setIsListening(false);
        }
      };
    });
  };

  const startSpeechRecognition = useCallback(async (): Promise<boolean> => {
    if (!supportsBrowserSpeechRecognition || !isCallActiveRef.current || aiRespondingRef.current) {
      return false;
    }

    if (speechRecognitionRef.current) {
      shouldRestartSpeechRecognitionRef.current = true;
      return true;
    }

    const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!RecognitionCtor) return false;

    clearSpeechRecognitionRestartTimer();
    shouldRestartSpeechRecognitionRef.current = true;

    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onspeechstart = () => {
      setIsListening(true);
    };

    recognition.onspeechend = () => {
      setIsListening(false);
    };

    recognition.onresult = (event) => {
      const inAssistantPlaybackWindow =
        aiRespondingRef.current
        || browserSpeechPendingCountRef.current > 0
        || Date.now() < resumeVoiceInputAtRef.current;

      if (inAssistantPlaybackWindow) {
        setInterimTranscript('');
        return;
      }

      let interimText = '';
      let finalText = '';

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript?.replace(/\s+/g, ' ').trim();
        if (!transcript) continue;
        if (result.isFinal) {
          finalText += `${transcript} `;
        } else {
          interimText += `${transcript} `;
        }
      }

      const cleanedInterim = interimText.trim();
      if (cleanedInterim) {
        if (isLikelyAssistantEcho(cleanedInterim)) {
          setInterimTranscript('');
          return;
        }
        setInterimTranscript(cleanedInterim);
        setIsListening(true);
      } else if (!finalText.trim()) {
        setInterimTranscript('');
      }

      const cleanedFinal = finalText.replace(/\s+/g, ' ').trim();
      if (!cleanedFinal) return;

      if (isLikelyAssistantEcho(cleanedFinal)) {
        setInterimTranscript('');
        return;
      }

      setInterimTranscript(cleanedFinal);
      setIsListening(false);
      if (isLiveSocketOpen() && !aiRespondingRef.current) {
        liveSocketRef.current?.send(JSON.stringify({
          event: 'user_text',
          transcript: cleanedFinal,
        }));
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'aborted') return;

      if (event.error === 'audio-capture') {
        toast.error('Microphone audio capture failed. Check browser and OS input settings.');
      } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        toast.error('Browser blocked live speech recognition. Allow microphone and speech access.');
      } else if (event.error !== 'no-speech') {
        toast.warning('Realtime speech recognition had an issue. Falling back to upload mode.');
      }

      speechRecognitionRef.current = null;
      setIsListening(false);
    };

    recognition.onend = () => {
      speechRecognitionRef.current = null;
      setIsListening(false);
      if (!shouldRestartSpeechRecognitionRef.current || !isCallActiveRef.current || aiRespondingRef.current) {
        return;
      }
      clearSpeechRecognitionRestartTimer();
      speechRecognitionRestartTimerRef.current = window.setTimeout(() => {
        void startSpeechRecognition();
      }, 120);
    };

    speechRecognitionRef.current = recognition;

    try {
      recognition.start();
      return true;
    } catch {
      speechRecognitionRef.current = null;
      return false;
    }
  }, [canUseUploadFallback, playConfiguredVoiceFallback, speakWithBrowserSynthesis, supportsBrowserSpeechRecognition]);

  const startLiveInput = useCallback(async (enableVoiceInput = true) => {
    const socketReady = await openLiveSocket();
    if (!socketReady) {
      toast.error('Failed to connect the realtime voice session.');
      return false;
    }

    await waitForTtsDrain();
    await waitForBrowserSpeechDrain();
    await waitForVoiceInputResumeWindow();

    if (!enableVoiceInput) {
      return true;
    }

    if (canUseUploadFallback && !supportsBrowserSpeechRecognition) {
      await startFallbackRecorder();
    }

    if (supportsBrowserSpeechRecognition) {
      await startSpeechRecognition();
    }
    return true;
  }, [canUseUploadFallback, startSpeechRecognition, supportsBrowserSpeechRecognition]);

  const readReceptionistStream = async (input: {
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    userMessage: string;
    onDelta: (delta: string) => void;
  }) => {
    const buildHeaders = (): HeadersInit => ({
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...getAuthHeaders(),
    });

    const makeRequest = () => fetch(`${API_BASE_URL}/llm/receptionist-test/stream`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        provider: 'openai',
        conversationHistory: input.conversationHistory,
        userMessage: input.userMessage,
      }),
    });

    let response = await makeRequest();

    if (response.status === 401) {
      const refreshed = await tryRefreshAccessToken();
      if (refreshed) {
        response = await makeRequest();
      }
    }

    if (!response.ok || !response.body) {
      throw new Error(await response.text() || 'Streaming request failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResponse = '';

    const processEventBlock = (block: string) => {
      const lines = block.split('\n');
      const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() ?? 'message';
      const data = lines
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');

      if (!data) return;

      const parsed = JSON.parse(data) as { delta?: string; response?: string; message?: string };

      if (event === 'chunk' && parsed.delta) {
        finalResponse += parsed.delta;
        input.onDelta(parsed.delta);
        return;
      }

      if (event === 'done') {
        finalResponse = parsed.response ?? finalResponse;
        return;
      }

      if (event === 'error') {
        throw new Error(parsed.message || 'Streaming failed');
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const boundaryIndex = buffer.indexOf('\n\n');
        if (boundaryIndex === -1) break;

        const block = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);
        if (!block.trim()) continue;
        processEventBlock(block);
      }
    }

    if (buffer.trim()) {
      processEventBlock(buffer);
    }

    return finalResponse.trim();
  };

  const sendCallerUtterance = async (utterance: string) => {
    const cleaned = utterance.trim();
    if (!cleaned) return;
    if (aiRespondingRef.current) return;
    aiRespondingRef.current = true;
    setIsStreamingResponse(true);
    stopSpeechRecognition();
    stopFallbackRecorder();
    utteranceAudioChunksRef.current = [];
    utteranceAudioBytesRef.current = 0;
    setInterimTranscript('');
    ttsQueueRef.current = [];
    ttsAccumulatorRef.current = '';

    const callerTurn: ChatTurn = { speaker: 'caller', text: cleaned, ts: new Date().toISOString() };
    const receptionistTs = new Date().toISOString();
    setTurns((prev) => [
      ...prev,
      callerTurn,
      { speaker: 'receptionist', text: '', ts: receptionistTs },
    ]);

    try {
      const history = turnsRef.current.filter((turn) => turn.text.trim()).slice(-6).map((turn) => ({
        role: turn.speaker === 'caller' ? ('user' as const) : ('assistant' as const),
        content: turn.text,
      }));

      const responseText = await readReceptionistStream({
        conversationHistory: history,
        userMessage: cleaned,
        onDelta: (delta) => {
          ttsAccumulatorRef.current += delta;
          setTurns((prev) => prev.map((turn) => (
            turn.speaker === 'receptionist' && turn.ts === receptionistTs
              ? { ...turn, text: `${turn.text}${delta}` }
              : turn
          )));

          const { segments, remainder } = extractSpeakableSegments(ttsAccumulatorRef.current);
          ttsAccumulatorRef.current = remainder;
          queueTtsSegments(segments);
        },
      });

      if (!responseText) {
        throw new Error('AI receptionist returned an empty response');
      }

      const { segments, remainder } = extractSpeakableSegments(ttsAccumulatorRef.current, true);
      ttsAccumulatorRef.current = remainder;
      const toSpeak = segments.length > 0 ? segments : (responseText.trim() ? [responseText.trim()] : []);
      queueTtsSegments(toSpeak);
      await waitForTtsDrain();
      await waitForBrowserSpeechDrain();
      blockVoiceInputResume();
      await waitForVoiceInputResumeWindow();
      rememberAssistantUtterance(responseText);
      setTurns((prev) => prev.map((turn) => (
        turn.speaker === 'receptionist' && turn.ts === receptionistTs
          ? { ...turn, text: responseText }
          : turn
      )));
    } catch {
      setTurns((prev) => prev.filter((turn) => turn.speaker !== 'receptionist' || turn.ts !== receptionistTs || turn.text.trim().length > 0));
      toast.error('AI receptionist failed to respond');
    } finally {
      aiRespondingRef.current = false;
      setIsStreamingResponse(false);
      if (isCallActiveRef.current) {
        window.setTimeout(() => {
          if (isCallActiveRef.current && !aiRespondingRef.current) {
            void startLiveInput();
          }
        }, 120);
      }
    }
  };

  const startCall = async () => {
    if (isCallActiveRef.current) return;
    let micReady = false;
    const canAttemptVoice = hasMediaRecorder && supportsWebmOpus;

    if (canAttemptVoice) {
      micReady = await requestMicrophonePermission();
    } else if (speechSupportReason) {
      toast.info('Voice input is unavailable in this browser, but you can still test the receptionist by typing.');
    }

    setIsCallActive(true);
    isCallActiveRef.current = true;
    setTurns([]);
    clearAudioPlayback();
    currentAssistantTurnTsRef.current = null;
    lastLiveTranscriptRef.current = '';
    lastLiveTranscriptAtRef.current = 0;
    lastAssistantUtteranceRef.current = '';
    lastAssistantUtteranceAtRef.current = 0;
    resumeVoiceInputAtRef.current = 0;
    shouldAutoEndCallRef.current = false;
    configuredVoicePreviewDisabledRef.current = false;
    configuredVoicePreviewAuthToastShownRef.current = false;
    setAudioSource('unknown');
    setVoiceWarning(null);
    setLiveVoiceId(null);
    setLiveVoiceName(null);

    const started = await startLiveInput(micReady);
    if (!started) {
      setIsCallActive(false);
      isCallActiveRef.current = false;
      return;
    }

    if (!micReady && canAttemptVoice) {
      toast.info('Test call started in typed mode. You can still send messages while microphone access is unavailable.');
    }
  };

  const endCall = () => {
    shouldAutoEndCallRef.current = false;
    setIsCallActive(false);
    isCallActiveRef.current = false;
    aiRespondingRef.current = false;
    setIsListening(false);
    setIsStreamingResponse(false);
    setInterimTranscript('');
    currentAssistantTurnTsRef.current = null;
    closeLiveSocket();
    stopSpeechRecognition();
    stopFallbackRecorder();
    utteranceAudioChunksRef.current = [];
    utteranceAudioBytesRef.current = 0;
    ttsAccumulatorRef.current = '';
    resumeVoiceInputAtRef.current = 0;
    configuredVoicePreviewDisabledRef.current = false;
    configuredVoicePreviewAuthToastShownRef.current = false;
    clearAudioPlayback();
  };

  const sendManualMessage = async () => {
    if (!manualInput.trim()) return;
    const text = manualInput;
    setManualInput('');
    if (isLiveSocketOpen()) {
      liveSocketRef.current?.send(JSON.stringify({
        event: 'user_text',
        transcript: text,
      }));
      return;
    }
    await sendCallerUtterance(text);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Test AI Receptionist</h2>
          <p className="text-sm text-muted-foreground">
            Simulate a live phone call using your microphone and hear the receptionist reply with configured voice settings.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Configured onboarding voice: {selectedVoice?.name ?? selectedVoiceId}
            {voiceProfile?.greetingMessage ? ' · greeting synced' : ''}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Live call voice: {liveVoiceName ?? liveVoice?.name ?? selectedVoice?.name ?? selectedVoiceId}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Audio source: {audioSource === 'elevenlabs'
              ? 'ElevenLabs live voice'
              : audioSource === 'configured-preview'
                ? 'Configured ElevenLabs voice preview'
                : audioSource === 'browser-fallback'
                  ? 'Browser fallback voice'
                  : audioSource === 'unavailable'
                    ? 'No live voice available for selected ElevenLabs voice'
                  : 'Waiting for call audio'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isCallActive ? 'default' : 'secondary'}>
            {isCallActive ? 'Call Active' : 'Call Inactive'}
          </Badge>
          <Badge variant={micDiagnostics.permission === 'granted' ? 'default' : micDiagnostics.permission === 'denied' ? 'destructive' : 'outline'}>
            Mic: {micDiagnostics.permission}
          </Badge>
          <Badge variant={isListening ? 'default' : 'outline'}>
            {isListening ? 'Listening' : 'Idle'}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configured voice</CardTitle>
          <CardDescription>
            This is the voice selected during onboarding for test replies.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">{selectedVoice?.name ?? selectedVoiceId}</Badge>
            {selectedVoice?.gender ? <Badge variant="outline">{selectedVoice.gender}</Badge> : null}
            {selectedVoice?.accent ? <Badge variant="outline">{selectedVoice.accent}</Badge> : null}
            {selectedVoice?.locale ? <Badge variant="outline">{selectedVoice.locale}</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Voice ID: {selectedVoice?.voiceId ?? selectedVoiceId}
          </p>
          {liveVoiceId && liveVoiceId !== selectedVoiceId ? (
            <p className="text-sm text-muted-foreground">
              Live call fallback voice: {liveVoiceName ?? liveVoice?.name ?? liveVoiceId}
            </p>
          ) : null}
          {voiceWarning ? (
            <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-700">
              {voiceWarning}
            </div>
          ) : null}
          {selectedVoice?.previewUrl ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const audio = new Audio(selectedVoice.previewUrl);
                    await audio.play();
                  } catch {
                    toast.error('Could not play the selected onboarding voice sample.');
                  }
                }}
              >
                Play selected voice sample
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live Call Controls</CardTitle>
          <CardDescription>
            Start a test call, speak naturally, and review live transcript in real time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button onClick={startCall} disabled={isCallActive} className="gap-2">
              <PhoneCallIcon className="size-4" />
              Start Test Call
            </Button>
            <Button variant="destructive" onClick={endCall} disabled={!isCallActive} className="gap-2">
              <PhoneOffIcon className="size-4" />
              End Call
            </Button>
          </div>

          {!hasMediaRecorder && speechSupportReason && (
            <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-700">
              <p className="font-medium">Microphone voice input unavailable</p>
              <p className="mt-1">{speechSupportReason}</p>
            </div>
          )}

          {hasMediaRecorder && (
            <MicrophoneDiagnosticsPanel
              diagnostics={micDiagnostics}
              isChecking={isRunningDiagnostics}
              onEnableMicrophone={() => {
                void requestMicrophonePermission();
              }}
              onRefresh={() => {
                void runDiagnostics(false);
              }}
              onSelectDevice={(deviceId) => {
                setMicDiagnostics((prev) => ({
                  ...prev,
                  selectedDeviceId: deviceId,
                  selectedDeviceLabel:
                    prev.devices.find((device) => device.deviceId === deviceId)?.label ?? prev.selectedDeviceLabel,
                }));
              }}
            />
          )}

          {interimTranscript && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="mb-1 font-medium">Live transcript (listening)</p>
              <p>{interimTranscript}</p>
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Type as fallback if microphone is unavailable"
            />
            <Button
              onClick={sendManualMessage}
              disabled={!isCallActive || isStreamingResponse || isSpeaking || isTranscribing || !manualInput.trim()}
              className="gap-2"
            >
              <MicIcon className="size-4" />
              Send
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live Transcript</CardTitle>
          <CardDescription>
            Real-time conversation transcript between caller and AI receptionist.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[28rem] space-y-3 overflow-y-auto rounded-md border bg-muted/20 p-3">
            {turns.length === 0 ? (
              <p className="text-sm text-muted-foreground">Start a call to see transcript here.</p>
            ) : (
              turns.map((turn, idx) => (
                <div
                  key={`${turn.ts}-${idx}`}
                  className={`rounded-md p-3 text-sm ${
                    turn.speaker === 'caller' ? 'ml-10 bg-primary/10' : 'mr-10 border bg-background'
                  }`}
                >
                  <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                    {turn.speaker === 'caller' ? 'Caller' : receptionistDisplayName}
                  </p>
                  <p className="whitespace-pre-wrap">{turn.text}</p>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
