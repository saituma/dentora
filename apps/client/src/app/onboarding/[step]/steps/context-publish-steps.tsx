import React from 'react';
import { BotIcon, PaperclipIcon, SendHorizontalIcon, UserIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getUserFriendlyApiError } from '@/lib/api-error';
import type { OnboardingFlow } from '../use-onboarding-flow';
import { STEP_ORDER } from '../onboarding-types';

export function AiChatStep({ flow }: { flow: OnboardingFlow }) {
  const [draft, setDraft] = React.useState('');
  const [isThinking, setIsThinking] = React.useState(false);
  const [messages, setMessages] = React.useState<Array<{ id: string; role: 'assistant' | 'user'; content: string }>>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Share details about your clinic, policies, pricing, scheduling, or scripts. I will turn everything into structured context for your AI receptionist.',
    },
  ]);
  const endOfMessagesRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const userMessageCount = messages.filter((message) => message.role === 'user').length;
  const hasChatContext = userMessageCount > 0;

  const sendMessage = async () => {
    const next = draft.trim();
    if (!next || isThinking) return;
    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user' as const,
      content: next,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft('');
    setIsThinking(true);
    try {
      const response = await fetch('/api/onboarding/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          clinicContext: flow.configuratorContext,
        }),
      });
      const payload = (await response.json()) as { reply?: string; error?: string };
      if (!response.ok || !payload.reply) {
        throw new Error(payload.error || 'Could not generate AI response.');
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: payload.reply as string,
        },
      ]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not generate AI response.';
      toast.error(message);
    } finally {
      setIsThinking(false);
    }
  };

  const chatContextDocumentContent = React.useMemo(() => {
    if (!hasChatContext) return '';
    const transcript = messages
      .filter((message) => message.role === 'assistant' || message.role === 'user')
      .map((message) => `### ${message.role === 'user' ? 'Clinic team' : 'AI context assistant'}\n${message.content}`)
      .join('\n\n');
    return `# AI Chat Context\n\n${transcript}\n\n# Clinic Snapshot\n${flow.configuratorContext}\n`;
  }, [flow.configuratorContext, hasChatContext, messages]);

  return (
    <div className="w-full">
      <input
        ref={flow.fileInputRef}
        type="file"
        multiple
        accept=".txt,.md,.csv,.json,.xml,.html,.pdf,.docx,.xlsx,text/plain,text/markdown,text/csv,application/json,text/xml,text/html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(event) => {
          if (event.target.files) {
            void flow.addContextFiles(event.target.files);
            event.target.value = '';
          }
        }}
      />
      <div className="flex min-h-[680px] flex-col overflow-hidden rounded-2xl border bg-background">
          <div className="border-b bg-muted/20 px-4 py-3">
            <p className="text-xs text-muted-foreground">Tell me everything your receptionist should know. Press Enter to send.</p>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto bg-muted/10 p-4 sm:p-6">
            {messages.map((message) => (
              <div key={message.id} className={`flex items-start gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}>
                {message.role === 'assistant' && (
                  <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
                    <BotIcon className="size-4" />
                  </div>
                )}
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'border bg-background text-foreground'}`}>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
                {message.role === 'user' && (
                  <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
                    <UserIcon className="size-4" />
                  </div>
                )}
              </div>
            ))}
            {isThinking && (
              <div className="flex items-start gap-3">
                <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
                  <BotIcon className="size-4" />
                </div>
                <div className="rounded-2xl border bg-background px-4 py-3 text-sm text-muted-foreground">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={endOfMessagesRef} />
          </div>
          <div className="border-t bg-background p-3 sm:p-4">
            <div className="flex items-end gap-2">
              <Button type="button" variant="outline" size="icon" onClick={() => flow.fileInputRef.current?.click()} aria-label="Attach context files">
                <PaperclipIcon className="size-4" />
              </Button>
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Type clinic details, scripts, rules, pricing, FAQs, or escalation instructions..."
                className="min-h-[52px] max-h-40 resize-y"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
              />
              <Button type="button" onClick={() => void sendMessage()} disabled={isThinking || draft.trim().length === 0} aria-label="Send message">
                <SendHorizontalIcon className="size-4" />
                Send
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Enter to send, Shift+Enter for new line.</p>
            <div className="mt-4 rounded-2xl border bg-muted/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Attached files</p>
              <Badge variant="outline">{flow.contextFiles.length}</Badge>
            </div>
            {flow.contextFiles.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No files uploaded yet. Chat alone also works.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {flow.contextFiles.map((file) => (
                  <div key={file.id} className="rounded-lg border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{Math.max(1, Math.round(file.size / 1024))} KB</p>
                      </div>
                      <Button type="button" size="icon-sm" variant="ghost" onClick={() => flow.setContextFiles((prev) => prev.filter((item) => item.id !== file.id))} aria-label={`Remove ${file.name}`}>
                        <XIcon className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="outline" onClick={flow.goBack} className="min-w-28">Back</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                try {
                  const documents = [
                    ...flow.contextFiles.map((file) => ({ name: file.name, content: file.content, mimeType: file.mimeType })),
                    ...(chatContextDocumentContent ? [{ name: 'chat-context-notes.md', content: chatContextDocumentContent, mimeType: 'text/markdown' }] : []),
                  ];
                  if (documents.length === 0) {
                    toast.error('Add chat notes or files before saving.');
                    return;
                  }
                  await flow.saveContextDocuments({
                    documents,
                  }).unwrap();
                  toast.success('AI context saved');
                  flow.goNext('test-call');
                } catch (error: unknown) {
                  toast.error(getUserFriendlyApiError(error));
                }
              }}
              disabled={flow.savingContextDocuments || (!hasChatContext && flow.contextFiles.length === 0)}
              className="min-w-40"
            >
              {flow.savingContextDocuments ? 'Saving...' : 'Save & Continue'}
            </Button>
            <Button type="button" variant="outline" onClick={() => flow.goNext('test-call')} className="min-w-32">Skip for now</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TestCallStep({ flow }: { flow: OnboardingFlow }) {
  return (
    <Card className="border-0 bg-card shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">Review & Go Live</CardTitle>
        <CardDescription>Review your configuration and publish to go live</CardDescription>
      </CardHeader>
      <CardContent>
        {flow.onboardingData && (
          <div className="mb-6 space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm font-medium">Readiness Score</span>
              <span className="text-lg font-bold text-primary">{flow.onboardingData.readinessScore}%</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm font-medium">Steps Completed</span>
              <span className="text-sm">{flow.onboardingData.completedSteps.length} / {STEP_ORDER.length}</span>
            </div>
            {flow.onboardingData.validationErrors.length > 0 && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                <p className="mb-1 text-sm font-medium text-destructive">Blocking Issues:</p>
                {flow.onboardingData.validationErrors.map((error, index) => (
                  <p key={index} className="text-xs text-destructive">{error.message}</p>
                ))}
                {flow.hasMissingPoliciesError && (
                  <div className="mt-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={flow.savingPolicies}
                      onClick={async () => {
                        try {
                          await flow.savePolicies({
                            policies: [
                              { policyType: 'escalation', content: 'Escalate to a human team member when the caller asks for clinical advice, has unresolved billing disputes, or requests manager intervention.' },
                              { policyType: 'emergency', content: 'If the caller reports severe pain, bleeding, trauma, or breathing issues, instruct them to call 911 immediately and notify the on-call staff.' },
                            ],
                          }).unwrap();
                          await flow.refetchOnboardingStatus();
                          toast.success('Policies fixed. You can publish now.');
                        } catch (error: unknown) {
                          toast.error(getUserFriendlyApiError(error));
                        }
                      }}
                    >
                      {flow.savingPolicies ? 'Fixing...' : 'Fix Policies & Refresh'}
                    </Button>
                  </div>
                )}
              </div>
            )}
            {flow.onboardingData.validationWarnings.length > 0 && (
              <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
                <p className="mb-1 text-sm font-medium text-yellow-600">Warnings:</p>
                {flow.onboardingData.validationWarnings.map((warning, index) => (
                  <p key={index} className="text-xs text-yellow-600">{warning.message}</p>
                ))}
              </div>
            )}
            {flow.calendarConnected && (
              <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-3">
                <p className="text-sm font-medium text-green-700">Connected to Google Calendar</p>
              </div>
            )}
            {flow.hasIntegrationWarning && (
              <div className="space-y-3 rounded-lg border p-3">
                <p className="text-sm font-medium">Connect Google Calendar now</p>
                <Field>
                  <FieldLabel>Google account email (optional)</FieldLabel>
                  <Input type="email" placeholder="frontdesk@clinic.com" value={flow.googleCalendarEmail} onChange={(event) => flow.setGoogleCalendarEmail(event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel>Calendar ID</FieldLabel>
                  <Input placeholder="primary" value={flow.googleCalendarId} onChange={(event) => flow.setGoogleCalendarId(event.target.value)} />
                </Field>
                <Button
                  type="button"
                  onClick={async () => {
                    try {
                      await flow.connectGoogleCalendar();
                    } catch (error: unknown) {
                      toast.error(getUserFriendlyApiError(error));
                    }
                  }}
                  disabled={flow.startingGoogleOAuth}
                  className="min-w-44"
                >
                  {flow.startingGoogleOAuth ? 'Redirecting...' : 'Connect Google Calendar'}
                </Button>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={flow.goBack} className="min-w-28">Back</Button>
          <Button
            disabled={flow.publishing || (flow.onboardingData && !flow.onboardingData.isReady)}
            onClick={async () => {
              try {
                await flow.publishConfig().unwrap();
                toast.success('Configuration published! Your AI receptionist is live.');
                flow.goNext('complete');
              } catch (error: unknown) {
                toast.error(getUserFriendlyApiError(error));
              }
            }}
            className="min-w-36"
          >
            {flow.publishing ? 'Publishing...' : 'Publish & Go Live'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
