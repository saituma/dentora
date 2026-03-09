import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { getUserFriendlyApiError } from '@/lib/api-error';
import { AudioPreviewPlayer } from '../onboarding-shared';
import type { OnboardingFlow } from '../use-onboarding-flow';

export function VoiceStep({ flow }: { flow: OnboardingFlow }) {
  return (
    <div className="space-y-6">
      <Card className="border-0 bg-card shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">Choose a voice</CardTitle>
          <CardDescription>Choose from the ElevenLabs voices available to your configured API key.</CardDescription>
        </CardHeader>
        <CardContent>
          {flow.availableVoices.length === 0 ? (
            <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-700">
              ElevenLabs returned voices for this account, but none of them are free live-supported API voices. On this account, those voices can be previewed, but not used for live call speech.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
                {flow.ukAgentVoices.length > 0
                  ? 'Showing free UK agent voices first. Voice samples use ElevenLabs preview clips so they still work without paid TTS preview credits.'
                  : flow.agentVoices.length > 0
                    ? 'Showing free ElevenLabs agent voices first so the receptionist sounds more natural for live calls.'
                    : flow.ukVoices.length > 0
                      ? 'No free agent voices were returned, so free UK-accent voices are shown instead.'
                      : 'No free UK or agent-specific voices were returned by ElevenLabs, so all free live-supported voices are shown instead.'}
              </div>
              <Field>
                <FieldLabel>Available voices</FieldLabel>
                <Select value={flow.selectedVoiceId} onValueChange={(value) => flow.setSelectedVoiceId(value || 'professional')}>
                  <SelectTrigger><SelectValue placeholder="Select a voice" /></SelectTrigger>
                  <SelectContent>
                    {flow.availableVoices.map((voice) => (
                      <SelectItem key={voice.voiceId} value={voice.voiceId}>
                        {voice.name}{voice.label ? ` - ${voice.label}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                {flow.availableVoices.map((voice) => (
                  <div
                    key={voice.voiceId}
                    role="button"
                    tabIndex={0}
                    onClick={() => flow.setSelectedVoiceId(voice.voiceId)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        flow.setSelectedVoiceId(voice.voiceId);
                      }
                    }}
                    className={`rounded-xl border p-4 transition ${flow.selectedVoiceId === voice.voiceId ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-card hover:border-primary/40'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{voice.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{voice.label || 'ElevenLabs voice'}</p>
                      </div>
                      {flow.selectedVoiceId === voice.voiceId && <Badge variant="default">Selected</Badge>}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {voice.gender && <Badge variant="outline">{voice.gender}</Badge>}
                      {voice.accent && <Badge variant="outline">{voice.accent}</Badge>}
                      {voice.locale && <Badge variant="outline">{voice.locale}</Badge>}
                      {voice.requiresPaidPlan && <Badge variant="secondary">Paid plan for live calls</Badge>}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!voice.previewUrl}
                        onClick={async (event) => {
                          event.stopPropagation();
                          try {
                            if (!voice.previewUrl) return;
                            const audio = new Audio(voice.previewUrl);
                            await audio.play();
                          } catch {
                            toast.error('Could not play the ElevenLabs sample clip. Try again.');
                          }
                        }}
                      >
                        {voice.previewUrl ? 'Play sample' : 'No sample clip'}
                      </Button>
                      {voice.previewUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            window.open(voice.previewUrl, '_blank', 'noopener,noreferrer');
                          }}
                        >
                          ElevenLabs sample
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
            <input type="range" min={0.8} max={1.2} step={0.05} value={flow.speakingSpeed} onChange={(event) => flow.setSpeakingSpeed(parseFloat(event.target.value))} className="w-full cursor-pointer accent-primary" />
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
            {flow.selectedVoiceRequiresPaidPlan && (
              <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-700">
                The selected ElevenLabs voice is a library voice and needs a paid ElevenLabs plan for live call speech. You can still use its free sample clip, but choose a live-supported voice before continuing.
              </div>
            )}
            <Field>
              <FieldLabel>Greeting</FieldLabel>
              <Textarea value={flow.greeting} onChange={(event) => flow.setGreeting(event.target.value)} rows={3} placeholder="Hi, welcome to Bright Smile Dental, what can I help you with today?" />
            </Field>
            <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-700">
              Custom greeting preview needs a paid ElevenLabs text-to-speech request. You can still use the selected voice sample below for free.
            </div>
            {flow.selectedVoice?.previewUrl ? (
              <AudioPreviewPlayer src={flow.selectedVoice.previewUrl} idleLabel="Play selected voice sample" playingLabel="Playing selected voice sample..." />
            ) : (
              <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                The selected voice does not include a free ElevenLabs sample clip.
              </div>
            )}
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={flow.goBack} className="min-w-28">Back</Button>
        <Button
          disabled={flow.savingVoice}
          onClick={async () => {
            try {
              if (flow.selectedVoiceRequiresPaidPlan) {
                toast.error('Choose a live-supported voice. This library voice needs a paid ElevenLabs plan for live call speech.');
                return;
              }
              await flow.saveVoiceProfile({
                voiceId: flow.selectedVoiceId,
                tone: 'professional',
                greeting: flow.greeting,
                speed: flow.speakingSpeed,
                language: flow.selectedVoice?.locale ?? 'en-US',
              }).unwrap();
              toast.success('Voice profile saved');
              flow.goNext('rules');
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
