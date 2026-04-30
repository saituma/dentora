import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { getUserFriendlyApiError } from '@/lib/api-error';
import { API_BASE_URL, ensureFreshAccessToken, getAuthHeaders } from '@/lib/api';
import { AGENT_OPTIONS } from '@/features/aiConfig/agent-options';
import type { OnboardingFlow } from '../use-onboarding-flow';

export function VoiceStep({ flow }: { flow: OnboardingFlow }) {
  const [previewAgentId, setPreviewAgentId] = useState<string | null>(null);
  const [previewStarting, setPreviewStarting] = useState(false);
  const [previewLoadingAgentId, setPreviewLoadingAgentId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const startPreview = async (agentId: string, customText?: string) => {
    if (previewStarting) return;
    setPreviewStarting(true);
    setPreviewLoadingAgentId(agentId);
    try {
      const textToPlay = customText || flow.greeting?.trim() || 'Hi, welcome to our clinic. How can I help you today?';
      const token = await ensureFreshAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      const auth = token ? { Authorization: `Bearer ${token}` } : getAuthHeaders();
      if (auth && typeof auth === 'object') {
        Object.assign(headers, auth as Record<string, string>);
      }

      const response = await fetch(`${API_BASE_URL}/elevenlabs/convai/agent-voice-preview`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          agentId,
          text: textToPlay,
          speed: flow.speakingSpeed,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Preview request failed: ${response.status} ${errorBody}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audioUrlRef.current = url;
      audio.onended = () => {
        setPreviewAgentId(null);
        if (audioUrlRef.current === url) {
          URL.revokeObjectURL(url);
          audioUrlRef.current = null;
        }
      };
      audio.onerror = () => {
        setPreviewAgentId(null);
        if (audioUrlRef.current === url) {
          URL.revokeObjectURL(url);
          audioUrlRef.current = null;
        }
      };
      await audio.play();
      setPreviewAgentId(agentId);
    } catch (error) {
      toast.error(getUserFriendlyApiError(error));
    } finally {
      setPreviewStarting(false);
      setPreviewLoadingAgentId(null);
    }
  };

  const stopPreview = async () => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      setPreviewAgentId(null);
      setPreviewLoadingAgentId(null);
    } catch (error) {
      toast.error(getUserFriendlyApiError(error));
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-0 bg-card shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">Choose an agent voice</CardTitle>
          <CardDescription>Select the ElevenLabs Conversational AI agent that will handle live calls.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {AGENT_OPTIONS.map((agent) => (
              <div
                key={agent.id}
                role="button"
                tabIndex={0}
                onClick={() => flow.setSelectedAgentId(agent.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    flow.setSelectedAgentId(agent.id);
                  }
                }}
                className={`rounded-xl border p-4 transition ${flow.selectedAgentId === agent.id ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-card hover:border-primary/40'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{agent.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{agent.label}</p>
                  </div>
                  {flow.selectedAgentId === agent.id && <Badge variant="default">Selected</Badge>}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={previewStarting && previewLoadingAgentId !== agent.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (previewAgentId === agent.id) {
                        void stopPreview();
                      } else {
                        void startPreview(agent.id);
                      }
                    }}
                  >
                    {previewLoadingAgentId === agent.id ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-primary" />
                        Loading...
                      </span>
                    ) : (
                      previewAgentId === agent.id ? 'Stop preview' : 'Play voice'
                    )}
                  </Button>
                  <span className="text-[11px] text-muted-foreground">Plays the greeting in this step.</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 bg-card shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">Speaking speed</CardTitle>
          <CardDescription>Adjust how fast the AI receptionist speaks. A moderate pace works best for most callers.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Slower</span>
              <span className="rounded-md bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">{flow.speakingSpeed.toFixed(1)}x</span>
              <span className="text-sm text-muted-foreground">Faster</span>
            </div>
            <div className="flex items-center gap-4">
              <input type="range" min={0.8} max={1.2} step={0.05} value={flow.speakingSpeed} onChange={(event) => flow.setSpeakingSpeed(parseFloat(event.target.value))} className="w-full cursor-pointer accent-primary" />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!flow.selectedAgentId || previewStarting}
                onClick={() => {
                  if (flow.selectedAgentId) {
                    if (previewAgentId === flow.selectedAgentId) {
                      void stopPreview();
                    } else {
                      void startPreview(flow.selectedAgentId, "This is how fast I talk right now.");
                    }
                  }
                }}
              >
                {previewAgentId ? 'Stop' : 'Test Speed'}
              </Button>
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>0.8x</span>
              <span>1.0x (default)</span>
              <span>1.2x</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 bg-card shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">Greeting message</CardTitle>
          <CardDescription>This is the first thing callers hear. Include your clinic name and offer to help.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel>Greeting</FieldLabel>
              <Textarea value={flow.greeting} onChange={(event) => flow.setGreeting(event.target.value)} rows={3} placeholder="Hi, welcome to Bright Smile Dental, what can I help you with today?" />
            </Field>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-4">
              <span className="text-sm text-muted-foreground">Hear how your greeting sounds with the selected voice and speed.</span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!flow.selectedAgentId || !flow.greeting?.trim() || previewStarting}
                onClick={() => {
                  if (flow.selectedAgentId && flow.greeting?.trim()) {
                    if (previewAgentId === flow.selectedAgentId) {
                      void stopPreview();
                    } else {
                      void startPreview(flow.selectedAgentId, flow.greeting);
                    }
                  }
                }}
              >
                {previewAgentId ? 'Stop' : 'Test Greeting'}
              </Button>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={flow.goBack} className="min-w-28">Back</Button>
        <Button
          disabled={flow.savingVoice}
          onClick={async () => {
            try {
              await flow.saveVoiceProfile({
                voiceId: flow.selectedVoiceId,
                agentId: flow.selectedAgentId,
                tone: 'professional',
                greeting: flow.greeting,
                speed: flow.speakingSpeed,
                language: flow.selectedVoice?.locale ?? 'en-US',
              }).unwrap();
              await flow.saveBookingRules({
                advanceBookingDays: flow.advanceBookingDays,
                cancellationHours: flow.cancellationHours,
                defaultAppointmentDurationMinutes: flow.defaultDuration,
              }).unwrap();
              await flow.savePolicies({
                policies: [
                  { policyType: 'escalation', content: 'Escalate to a human team member when the caller asks for clinical advice, has unresolved billing disputes, or requests manager intervention.' },
                  { policyType: 'emergency', content: 'If the caller reports severe pain, bleeding, trauma, or breathing issues, instruct them to call 911 immediately and notify the on-call staff.' },
                ],
              }).unwrap();
              toast.success('Voice profile saved');
              flow.goNext('phone-number');
            } catch (error: unknown) {
              toast.error(getUserFriendlyApiError(error));
            }
          }}
          className="min-w-28"
        >
          {flow.savingVoice ? 'Saving...' : 'Next'}
        </Button>
      </div>
    </div>
  );
}
