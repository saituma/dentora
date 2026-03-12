'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2Icon } from 'lucide-react';
import { AGENT_OPTIONS } from '@/features/aiConfig/agent-options';

type Tone = 'friendly' | 'professional' | 'formal' | 'casual' | 'warm' | 'calm';

export function VoiceTab(props: {
  voiceLoading: boolean;
  voicesLoading: boolean;
  selectedVoice?: { requiresPaidPlan?: boolean } | null;
  greeting: string;
  setGreeting: (value: string) => void;
  agentId: string;
  setAgentId: (value: string) => void;
  voiceId: string;
  setVoiceId: (value: string) => void;
  availableVoices: Array<{ voiceId: string; name: string; label?: string; requiresPaidPlan?: boolean }>;
  tone: Tone;
  setTone: (value: Tone) => void;
  language: string;
  setLanguage: (value: string) => void;
  afterHoursMessage: string;
  setAfterHoursMessage: (value: string) => void;
  handlePreviewVoice: () => Promise<void>;
  previewGenerating: boolean;
  handleSaveVoice: () => Promise<void>;
  voiceSaving: boolean;
}) {
  const {
    voiceLoading,
    voicesLoading,
    selectedVoice,
    greeting,
    setGreeting,
    agentId,
    setAgentId,
    voiceId,
    setVoiceId,
    availableVoices,
    tone,
    setTone,
    language,
    setLanguage,
    afterHoursMessage,
    setAfterHoursMessage,
    handlePreviewVoice,
    previewGenerating,
    handleSaveVoice,
    voiceSaving,
  } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle>ElevenLabs voice</CardTitle>
        <CardDescription>
          Choose the receptionist voice dynamically from ElevenLabs and use it for previews and live test calls.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {voiceLoading || voicesLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <FieldGroup>
            {selectedVoice?.requiresPaidPlan ? (
              <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-700">
                This selected ElevenLabs library voice needs a paid ElevenLabs plan for live call speech. Choose a live-supported voice to use it in test calls.
              </div>
            ) : null}
            <Field>
              <FieldLabel>Greeting message</FieldLabel>
              <Textarea
                rows={3}
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                placeholder="Hi, welcome to our clinic, what can I help you with today?"
              />
            </Field>

            <Field>
              <FieldLabel>Agent voice (live calls)</FieldLabel>
              <Select value={agentId} onValueChange={(value) => setAgentId(value || AGENT_OPTIONS[0]?.id || '')}>
                <SelectTrigger>
                  <SelectValue placeholder="Select agent voice" />
                </SelectTrigger>
                <SelectContent>
                  {AGENT_OPTIONS.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name} {agent.label ? `- ${agent.label}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Tone</FieldLabel>
                <Select value={tone} onValueChange={(value) => setTone((value as Tone) || 'professional')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="warm">Warm</SelectItem>
                    <SelectItem value="calm">Calm</SelectItem>
                    <SelectItem value="formal">Formal</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Language</FieldLabel>
                <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="en-US" />
              </Field>
            </div>

            <Field>
              <FieldLabel>After-hours message</FieldLabel>
              <Textarea
                rows={2}
                value={afterHoursMessage}
                onChange={(e) => setAfterHoursMessage(e.target.value)}
                placeholder="We are currently closed. Please leave a message and our team will return your call."
              />
            </Field>

            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="outline" onClick={handlePreviewVoice} disabled={previewGenerating}>
                {previewGenerating ? <Loader2Icon className="mr-2 size-4 animate-spin" /> : null}
                Preview voice
              </Button>
              <Button onClick={handleSaveVoice} disabled={voiceSaving}>
                {voiceSaving ? <Loader2Icon className="mr-2 size-4 animate-spin" /> : null}
                Save voice profile
              </Button>
            </div>
          </FieldGroup>
        )}
      </CardContent>
    </Card>
  );
}
