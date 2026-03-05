'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  useGetBookingRulesQuery,
  useGetFaqsQuery,
  useGetPoliciesQuery,
  useGetServicesQuery,
  useGetVoiceProfileQuery,
} from '@/features/aiConfig/aiConfigApi';
import { useExecuteLlmMutation } from '@/features/llm/llmApi';
import {
  useGenerateVoicePreviewMutation,
  useTranscribeLiveAudioMutation,
} from '@/features/onboarding/onboardingApi';
import {
  runMicrophoneDiagnostics,
  type MicrophoneDiagnosticsResult,
} from '@/lib/microphone-diagnostics';
import { getUserFriendlyApiError } from '@/lib/api-error';

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

export default function TestAiReceptionistPage() {
  const { data: clinic } = useGetClinicQuery();
  const { data: voiceProfile } = useGetVoiceProfileQuery();
  const { data: servicesData } = useGetServicesQuery();
  const { data: faqsData } = useGetFaqsQuery();
  const { data: bookingRules } = useGetBookingRulesQuery();
  const { data: policiesData } = useGetPoliciesQuery();

  const [executeLlm, { isLoading: isThinking }] = useExecuteLlmMutation();
  const [generateVoicePreview, { isLoading: isSpeaking }] = useGenerateVoicePreviewMutation();
  const [transcribeLiveAudio, { isLoading: isTranscribing }] = useTranscribeLiveAudioMutation();

  const [isCallActive, setIsCallActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [micDiagnostics, setMicDiagnostics] = useState<MicrophoneDiagnosticsResult>(INITIAL_MIC_DIAGNOSTICS);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const fallbackSilenceTimerRef = useRef<number | null>(null);
  const fallbackBufferRef = useRef('');
  const transcribeErrorShownRef = useRef(false);
  const processingRef = useRef(false);
  const isCallActiveRef = useRef(false);

  const hasMediaRecorder = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined';

  const speechSupportReason = !hasMediaRecorder
    ? 'Live microphone capture is unavailable in this browser. Use Chrome/Edge/Firefox on HTTPS or localhost.'
    : null;

  const services = servicesData?.data ?? [];
  const faqs = faqsData?.data ?? [];
  const policies = policiesData?.data ?? [];

  const contextPrompt = useMemo(() => {
    return [
      'You are a dental clinic AI receptionist simulating a real phone call.',
      'Speak naturally, concise, warm, and helpful.',
      `Clinic name: ${clinic?.clinicName ?? 'Dental clinic'}`,
      `Timezone: ${clinic?.timezone ?? 'America/New_York'}`,
      `Primary phone: ${clinic?.phone ?? 'not provided'}`,
      `Support email: ${clinic?.email ?? 'not provided'}`,
      `Tone: ${voiceProfile?.tone ?? 'professional'}`,
      `Greeting: ${voiceProfile?.greetingMessage ?? 'Hi, thank you for calling. How can I help you today?'}`,
      `Default appointment duration: ${bookingRules?.defaultAppointmentDurationMinutes ?? 30} minutes`,
      `Min notice: ${bookingRules?.minNoticePeriodHours ?? 2} hours`,
      `Max advance booking: ${bookingRules?.maxAdvanceBookingDays ?? 30} days`,
      `Services: ${services.map((s) => s.serviceName).join(', ') || 'none configured'}`,
      `FAQs: ${faqs.map((f) => f.question).join(' | ') || 'none configured'}`,
      `Policies: ${policies.map((p) => `${p.policyType}: ${p.content}`).join(' | ') || 'none configured'}`,
      'If caller asks something unknown, say you can have the clinic follow up.',
      'Do not mention that you are an AI unless explicitly asked.',
    ].join('\n');
  }, [bookingRules, clinic?.clinicName, clinic?.email, clinic?.phone, clinic?.timezone, faqs, policies, services, voiceProfile?.greetingMessage, voiceProfile?.tone]);

  const selectedVoiceId =
    voiceProfile?.voiceId || TONE_TO_VOICE_ID[voiceProfile?.tone ?? 'professional'] || TONE_TO_VOICE_ID.professional;

  useEffect(() => {
    isCallActiveRef.current = isCallActive;
  }, [isCallActive]);

  const stopFallbackRecorder = () => {
    if (fallbackSilenceTimerRef.current !== null) {
      window.clearTimeout(fallbackSilenceTimerRef.current);
      fallbackSilenceTimerRef.current = null;
    }

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

    fallbackBufferRef.current = '';
    setInterimTranscript('');
    setIsListening(false);
  };

  const startFallbackRecorder = async () => {
    if (!isCallActiveRef.current || mediaRecorderRef.current || !hasMediaRecorder) return;

    try {
      const stream = mediaStreamRef.current ?? await navigator.mediaDevices.getUserMedia({
        audio: micDiagnostics.selectedDeviceId
          ? {
              deviceId: { exact: micDiagnostics.selectedDeviceId },
            }
          : true,
      });
      mediaStreamRef.current = stream;
      transcribeErrorShownRef.current = false;

      const preferredMimeTypes = [
        'audio/mp4',
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
      ];
      const mimeType = preferredMimeTypes.find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = async (event) => {
        if (!isCallActiveRef.current || processingRef.current) return;
        if (!event.data || event.data.size === 0) return;

        try {
          const arrayBuffer = await event.data.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let index = 0; index < bytes.byteLength; index += 1) {
            binary += String.fromCharCode(bytes[index]);
          }
          const audioBase64 = btoa(binary);

          const transcriptChunk = (await transcribeLiveAudio({
            audioBase64,
            mimeType: event.data.type || mimeType || 'audio/webm',
            language: 'en',
          }).unwrap()).trim();

          if (!transcriptChunk) return;

          fallbackBufferRef.current = `${fallbackBufferRef.current} ${transcriptChunk}`.trim();
          setInterimTranscript(fallbackBufferRef.current);

          if (fallbackSilenceTimerRef.current !== null) {
            window.clearTimeout(fallbackSilenceTimerRef.current);
          }

          fallbackSilenceTimerRef.current = window.setTimeout(() => {
            const utterance = fallbackBufferRef.current.trim();
            fallbackBufferRef.current = '';
            setInterimTranscript('');
            if (utterance) {
              void sendCallerUtterance(utterance);
            }
          }, 1200);
        } catch (error) {
          if (!transcribeErrorShownRef.current) {
            transcribeErrorShownRef.current = true;
            toast.error(getUserFriendlyApiError(error));
          }
        }
      };

      recorder.onstop = () => {
        setIsListening(false);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1500);
      setIsListening(true);
    } catch {
      toast.error('Microphone access failed. Allow mic permissions to run live call tests.');
      await runDiagnostics(false);
    }
  };

  const runDiagnostics = async (requestPermission: boolean) => {
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
  };

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
  }, []);

  const speakText = async (text: string) => {
    try {
      const audioUrl = await generateVoicePreview({
        voiceId: selectedVoiceId,
        text,
        speed: voiceProfile?.speechSpeed ?? 1,
      }).unwrap();

      if (!audioRef.current) {
        audioRef.current = new Audio();
      }

      stopFallbackRecorder();

      audioRef.current.src = audioUrl;
      await audioRef.current.play();

      audioRef.current.onended = () => {
        URL.revokeObjectURL(audioUrl);
        void startFallbackRecorder();
      };
    } catch {
      toast.error('Failed to play AI voice response');
      void startFallbackRecorder();
    }
  };

  const sendCallerUtterance = async (utterance: string) => {
    const cleaned = utterance.trim();
    if (!cleaned || processingRef.current) return;

    processingRef.current = true;
    setTurns((prev) => [...prev, { speaker: 'caller', text: cleaned, ts: new Date().toISOString() }]);

    try {
      const llmMessages = [
        { role: 'system' as const, content: contextPrompt },
        ...turns.map((turn) => ({
          role: turn.speaker === 'caller' ? ('user' as const) : ('assistant' as const),
          content: turn.text,
        })),
        { role: 'user' as const, content: cleaned },
      ];

      const result = await executeLlm({
        provider: 'openai',
        task: 'generate_response',
        payload: {
          model: 'gpt-4o-mini',
          messages: llmMessages,
          temperature: 0.5,
          maxTokens: 400,
        },
      }).unwrap();

      const responseText = result.data.response.trim();
      setTurns((prev) => [...prev, { speaker: 'receptionist', text: responseText, ts: new Date().toISOString() }]);
      await speakText(responseText);
    } catch {
      toast.error('AI receptionist failed to respond');
      void startFallbackRecorder();
    } finally {
      processingRef.current = false;
    }
  };

  const startCall = async () => {
    if (isCallActiveRef.current) return;

    const greeting =
      voiceProfile?.greetingMessage ||
      `Hi, thank you for calling ${clinic?.clinicName ?? 'our clinic'}. How can I help you today?`;

    const micReady = await requestMicrophonePermission();

    if (hasMediaRecorder && !micReady) {
      return;
    }

    setIsCallActive(true);
    setTurns([]);
    setTurns((prev) => [...prev, { speaker: 'receptionist', text: greeting, ts: new Date().toISOString() }]);
    await speakText(greeting);

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
    setIsListening(false);
    setInterimTranscript('');
    stopFallbackRecorder();
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
              disabled={!isCallActive || isThinking || isSpeaking || isTranscribing || !manualInput.trim()}
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
