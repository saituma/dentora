import { MicIcon, PhoneCallIcon, PhoneOffIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { MicrophoneDiagnosticsPanel } from '@/components/microphone-diagnostics-panel';
import type { UseTestAiReceptionistResult } from './use-test-ai-receptionist';

export function TestAiReceptionistView({ model }: { model: UseTestAiReceptionistResult }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Test AI Receptionist</h2>
          <p className="text-sm text-muted-foreground">
            Simulate a live phone call using your microphone and hear the receptionist reply with configured voice settings.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Configured onboarding voice: {model.selectedVoice?.name ?? model.selectedVoiceId}
            {model.voiceProfile?.greetingMessage ? ' · greeting synced' : ''}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Live call voice: {model.liveVoiceName ?? model.liveVoice?.name ?? model.selectedVoice?.name ?? model.selectedVoiceId}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Audio source: {model.audioSource === 'elevenlabs'
              ? 'ElevenLabs live voice'
              : model.audioSource === 'configured-preview'
                ? 'Configured ElevenLabs voice preview'
                : model.audioSource === 'browser-fallback'
                  ? 'Browser fallback voice'
                  : model.audioSource === 'unavailable'
                    ? 'No live voice available for selected ElevenLabs voice'
                    : 'Waiting for call audio'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={model.isCallActive ? 'default' : 'secondary'}>
            {model.isCallActive ? 'Call Active' : 'Call Inactive'}
          </Badge>
          <Badge variant={model.micDiagnostics.permission === 'granted' ? 'default' : model.micDiagnostics.permission === 'denied' ? 'destructive' : 'outline'}>
            Mic: {model.micDiagnostics.permission}
          </Badge>
          <Badge variant={model.isListening ? 'default' : 'outline'}>
            {model.isListening ? 'Listening' : 'Idle'}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configured voice</CardTitle>
          <CardDescription>This is the voice selected during onboarding for test replies.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">{model.selectedVoice?.name ?? model.selectedVoiceId}</Badge>
            {model.selectedVoice?.gender ? <Badge variant="outline">{model.selectedVoice.gender}</Badge> : null}
            {model.selectedVoice?.accent ? <Badge variant="outline">{model.selectedVoice.accent}</Badge> : null}
            {model.selectedVoice?.locale ? <Badge variant="outline">{model.selectedVoice.locale}</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">Voice ID: {model.selectedVoice?.voiceId ?? model.selectedVoiceId}</p>
          {model.liveVoiceId && model.liveVoiceId !== model.selectedVoiceId ? (
            <p className="text-sm text-muted-foreground">
              Live call fallback voice: {model.liveVoiceName ?? model.liveVoice?.name ?? model.liveVoiceId}
            </p>
          ) : null}
          {model.voiceWarning ? (
            <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-700">
              {model.voiceWarning}
            </div>
          ) : null}
          {model.selectedVoice?.previewUrl ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const audio = new Audio(model.selectedVoice!.previewUrl!);
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
          <CardDescription>Start a test call, speak naturally, and review live transcript in real time.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button onClick={model.startCall} disabled={model.isCallActive} className="gap-2">
              <PhoneCallIcon className="size-4" />
              Start Test Call
            </Button>
            <Button variant="destructive" onClick={model.endCall} disabled={!model.isCallActive} className="gap-2">
              <PhoneOffIcon className="size-4" />
              End Call
            </Button>
          </div>

          {!model.hasMediaRecorder && model.speechSupportReason && (
            <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-700">
              <p className="font-medium">Microphone voice input unavailable</p>
              <p className="mt-1">{model.speechSupportReason}</p>
            </div>
          )}

          {model.hasMediaRecorder && (
            <MicrophoneDiagnosticsPanel
              diagnostics={model.micDiagnostics}
              isChecking={model.isRunningDiagnostics}
              onEnableMicrophone={() => {
                void model.requestMicrophonePermission();
              }}
              onRefresh={() => {
                void model.runDiagnostics(false);
              }}
              onSelectDevice={(deviceId) => {
                model.setMicDiagnostics((prev) => ({
                  ...prev,
                  selectedDeviceId: deviceId,
                  selectedDeviceLabel:
                    prev.devices.find((device) => device.deviceId === deviceId)?.label ?? prev.selectedDeviceLabel,
                }));
              }}
            />
          )}

          {model.interimTranscript && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="mb-1 font-medium">Live transcript (listening)</p>
              <p>{model.interimTranscript}</p>
            </div>
          )}

          <div className="flex gap-2">
            <Input value={model.manualInput} onChange={(event) => model.setManualInput(event.target.value)} placeholder="Type as fallback if microphone is unavailable" />
            <Button
              onClick={model.sendManualMessage}
              disabled={!model.isCallActive || model.isStreamingResponse || model.isSpeaking || model.isTranscribing || !model.manualInput.trim()}
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
          <CardDescription>Real-time conversation transcript between caller and AI receptionist.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[28rem] space-y-3 overflow-y-auto rounded-md border bg-muted/20 p-3">
            {model.turns.length === 0 ? (
              <p className="text-sm text-muted-foreground">Start a call to see transcript here.</p>
            ) : (
              model.turns.map((turn, index) => (
                <div
                  key={`${turn.ts}-${index}`}
                  className={`rounded-md p-3 text-sm ${turn.speaker === 'caller' ? 'ml-10 bg-primary/10' : 'mr-10 border bg-background'}`}
                >
                  <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                    {turn.speaker === 'caller' ? 'Caller' : model.receptionistDisplayName}
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
