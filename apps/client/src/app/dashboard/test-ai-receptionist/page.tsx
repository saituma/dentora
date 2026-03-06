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
import { useGetClinicQuery } from '@/features/clinic/clinicApi';
import { useGetVoiceProfileQuery } from '@/features/aiConfig/aiConfigApi';
import {
  useGenerateVoicePreviewMutation,
  useTranscribeLiveAudioMutation,
} from '@/features/onboarding/onboardingApi';
import {
  runMicrophoneDiagnostics,
  type MicrophoneDiagnosticsResult,
} from '@/lib/microphone-diagnostics';
import { getUserFriendlyApiError } from '@/lib/api-error';
import { API_BASE_URL, getAuthHeaders, tryRefreshAccessToken } from '@/lib/api';

type ChatTurn = { speaker: 'caller' | 'receptionist'; text: string; ts: string };

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
const LIVE_AUDIO_UPLOAD_MIME_TYPE = 'audio/webm';
const MAX_LIVE_AUDIO_CHUNK_BYTES = 1024 * 1024;
const EARLY_TTS_MIN_CHARS = 28;
/** Record 1s at a time and restart so each blob is a self-contained WebM. Shorter = faster turnaround. */
const LIVE_AUDIO_RECORD_TIMESLICE_MS = 1500;

export default function TestAiReceptionistPage() {
  const { data: clinic } = useGetClinicQuery();
  const { data: voiceProfile } = useGetVoiceProfileQuery();

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
  const ttsQueueRef = useRef<string[]>([]);
  const isProcessingTtsQueueRef = useRef(false);
  const ttsAccumulatorRef = useRef('');
  const ttsDrainResolversRef = useRef<Array<() => void>>([]);

  const hasMediaRecorder = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined';
  const supportsWebmOpus = hasMediaRecorder && MediaRecorder.isTypeSupported(LIVE_AUDIO_RECORDER_MIME_TYPE);

  const speechSupportReason = !hasMediaRecorder
    ? 'Live microphone capture is unavailable in this browser. Use Chrome/Edge/Firefox on HTTPS or localhost.'
    : !supportsWebmOpus
      ? 'This browser does not support audio/webm;codecs=opus live capture required for real-time transcription.'
      : null;

  const selectedVoiceId =
    voiceProfile?.voiceId || TONE_TO_VOICE_ID[voiceProfile?.tone ?? 'professional'] || TONE_TO_VOICE_ID.professional;

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
        audio: micDiagnostics.selectedDeviceId
          ? {
              deviceId: { exact: micDiagnostics.selectedDeviceId },
            }
          : true,
      });
      mediaStreamRef.current = stream;
      streamForRecorderRef.current = stream;
      transcribeErrorShownRef.current = false;
      oversizedChunkWarningShownRef.current = false;

      const sendBufferedUtterance = async () => {
        if (aiRespondingRef.current) return;
        const audioChunks = utteranceAudioChunksRef.current;
        if (audioChunks.length === 0 || utteranceAudioBytesRef.current < 2048) return;

        if (fallbackSilenceTimerRef.current !== null) {
          window.clearTimeout(fallbackSilenceTimerRef.current);
          fallbackSilenceTimerRef.current = null;
        }

        const transcriptionSessionId = transcriptionSessionRef.current;
        const utteranceBlob = new Blob(audioChunks, { type: LIVE_AUDIO_UPLOAD_MIME_TYPE });
        utteranceAudioChunksRef.current = [];
        utteranceAudioBytesRef.current = 0;
        setInterimTranscript('');
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

          if (avg >= 18) voiceDetectedRef.current = true;

          if (avg < 10) {
            if (userSilentSinceRef.current === null) {
              userSilentSinceRef.current = Date.now();
            } else if (Date.now() - userSilentSinceRef.current >= 600) {
              void sendBufferedUtterance();
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
            utteranceAudioChunksRef.current.push(event.data);
            utteranceAudioBytesRef.current += event.data.size;
            setInterimTranscript('Listening...');
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

  const playTtsText = useCallback(async (text: string) => {
    try {
      const audioUrl = await generateVoicePreview({
        voiceId: selectedVoiceId,
        text,
        speed: voiceProfile?.speechSpeed ?? 1,
      }).unwrap();

      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = audioUrl;
      await audioRef.current.play();
      await new Promise<void>((resolve) => {
        audioRef.current!.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
      });
    } catch {
      toast.error('Failed to play AI voice response');
    }
  }, [generateVoicePreview, selectedVoiceId, voiceProfile?.speechSpeed]);

  const resolveTtsDrain = () => {
    const resolvers = ttsDrainResolversRef.current.splice(0);
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

  const extractSpeakableSegments = (buffer: string, flushRemainder = false) => {
    const segments: string[] = [];
    let start = 0;
    let lastCommittedIndex = 0;

    for (let index = 0; index < buffer.length; index += 1) {
      const char = buffer[index];
      const currentLength = index + 1 - lastCommittedIndex;
      const isStrongBoundary = char === '.' || char === '!' || char === '?';
      const isSoftBoundary =
        (char === ',' || char === ';' || char === ':') && currentLength >= EARLY_TTS_MIN_CHARS;
      const isEarlyWordBoundary =
        char === ' ' && currentLength >= EARLY_TTS_MIN_CHARS + 18;

      if (isStrongBoundary || isSoftBoundary || isEarlyWordBoundary) {
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
        await playTtsText(nextSegment);
      }
    } finally {
      isProcessingTtsQueueRef.current = false;
      if (ttsQueueRef.current.length === 0) {
        resolveTtsDrain();
      }
    }
  }, [playTtsText]);

  const queueTtsSegments = useCallback((segments: string[]) => {
    const cleanedSegments = segments.map((segment) => segment.trim()).filter(Boolean);
    if (cleanedSegments.length === 0) return;
    ttsQueueRef.current.push(...cleanedSegments);
    void processTtsQueue();
  }, [processTtsQueue]);

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
      const history = turnsRef.current.map((turn) => ({
        role: turn.speaker === 'caller' ? ('user' as const) : ('assistant' as const),
        content: turn.text,
      }));

      const responseText = await readReceptionistStream({
        conversationHistory: history,
        userMessage: cleaned,
        onDelta: (delta) => {
          ttsAccumulatorRef.current += delta;
          setTurns((prev) => prev.map((turn) => (
            turn.ts === receptionistTs
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
      queueTtsSegments(segments);
      await waitForTtsDrain();
      setTurns((prev) => prev.map((turn) => (
        turn.ts === receptionistTs
          ? { ...turn, text: responseText }
          : turn
      )));
    } catch {
      setTurns((prev) => prev.filter((turn) => turn.ts !== receptionistTs || turn.text.trim().length > 0));
      toast.error('AI receptionist failed to respond');
    } finally {
      aiRespondingRef.current = false;
      setIsStreamingResponse(false);
      if (isCallActiveRef.current) {
        window.setTimeout(() => {
          if (isCallActiveRef.current && !aiRespondingRef.current) {
            void startFallbackRecorder();
          }
        }, 350);
      }
    }
  };

  const startCall = async () => {
    if (isCallActiveRef.current) return;

    const greeting =
      voiceProfile?.greetingMessage ||
      `Hello, thank you for calling ${clinic?.clinicName ?? 'our clinic'}. How may I help you today?`;

    const micReady = await requestMicrophonePermission();

    if (hasMediaRecorder && !micReady) {
      return;
    }

    if (hasMediaRecorder && !supportsWebmOpus) {
      toast.error('This browser cannot stream audio/webm;codecs=opus. Use Chrome or Edge for live voice tests.');
      return;
    }

    setIsCallActive(true);
    isCallActiveRef.current = true;
    setTurns([{ speaker: 'receptionist', text: greeting, ts: new Date().toISOString() }]);
    await playTtsText(greeting);

    if (!hasMediaRecorder) {
      toast.error('Microphone capture is unavailable in this browser session. Use manual input below.');
      return;
    }

    if (micReady) {
      await startFallbackRecorder();
    }
  };

  const endCall = () => {
    setIsCallActive(false);
    isCallActiveRef.current = false;
    aiRespondingRef.current = false;
    setIsListening(false);
    setIsStreamingResponse(false);
    setInterimTranscript('');
    stopFallbackRecorder();
    utteranceAudioChunksRef.current = [];
    utteranceAudioBytesRef.current = 0;
    ttsQueueRef.current = [];
    ttsAccumulatorRef.current = '';
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const sendManualMessage = async () => {
    if (!manualInput.trim()) return;
    const text = manualInput;
    setManualInput('');
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
                    {turn.speaker === 'caller' ? 'Caller' : 'AI Receptionist'}
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
