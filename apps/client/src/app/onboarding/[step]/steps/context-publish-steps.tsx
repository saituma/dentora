import React from 'react';
import { BotIcon, CameraIcon, CheckCircle2Icon, GlobeIcon, PaperclipIcon, SendHorizontalIcon, UserIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getUserFriendlyApiError } from '@/lib/api-error';
import { API_BASE_URL, ensureFreshAccessToken, getAuthHeaders } from '@/lib/api';
import { useGetClinicQuery, useUpdateClinicMutation } from '@/features/clinic/clinicApi';
import type { ClinicProfile } from '@/features/clinic/types';
import { useRouter } from 'next/navigation';
import type { OnboardingFlow } from '../use-onboarding-flow';
import { STEP_ORDER } from '../onboarding-types';

const MAX_CLINIC_PHOTO_BYTES = 1_500_000;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export function AiChatStep({ flow }: { flow: OnboardingFlow }) {
  const { data: clinic } = useGetClinicQuery();
  const [updateClinic, { isLoading: savingClinicMaterials }] = useUpdateClinicMutation();
  const [website, setWebsite] = React.useState('');
  const [logoPreview, setLogoPreview] = React.useState<string | undefined>(undefined);
  const [logoTouched, setLogoTouched] = React.useState(false);
  const aboutClinicFileRef = React.useRef<HTMLInputElement>(null);
  const websiteHydratedRef = React.useRef(false);

  React.useEffect(() => {
    if (!clinic || websiteHydratedRef.current) return;
    setWebsite((clinic.website ?? '').trim());
    websiteHydratedRef.current = true;
  }, [clinic]);

  React.useEffect(() => {
    if (!logoTouched) {
      setLogoPreview(clinic?.logo ?? undefined);
    }
  }, [clinic?.logo, logoTouched]);

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
      const token = await ensureFreshAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const auth = token ? { Authorization: `Bearer ${token}` } : getAuthHeaders();
      if (auth && typeof auth === 'object') {
        Object.assign(headers, auth as Record<string, string>);
      }

      const response = await fetch(`${API_BASE_URL}/onboarding/ai-chat`, {
        method: 'POST',
        headers,
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

  const photoInputRef = React.useRef<HTMLInputElement>(null);

  const normalizeWebsite = (raw: string) => {
    const t = raw.trim();
    if (!t) return '';
    const withProto = t.includes('://') ? t : `https://${t}`;
    try {
      const u = new URL(withProto);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return u.toString();
    } catch {
      return null;
    }
  };

  const saveClinicMaterials = async () => {
    const normalized = normalizeWebsite(website);
    if (website.trim() && normalized === null) {
      toast.error('Enter a valid website URL (for example https://yourclinic.com).');
      return;
    }
    const serverWebsite = (clinic?.website ?? '').trim();
    const websiteChanged = (normalized || '') !== serverWebsite;
    if (!websiteChanged && !logoTouched) {
      toast.info('No changes to save.');
      return;
    }
    try {
      const body: Partial<ClinicProfile> = {};
      if (websiteChanged) {
        body.website = normalized ?? '';
      }
      if (logoTouched) {
        body.logo = logoPreview ?? '';
      }
      await updateClinic(body).unwrap();
      setLogoTouched(false);
      toast.success('Website and clinic photo saved.');
    } catch (error: unknown) {
      toast.error(getUserFriendlyApiError(error));
    }
  };

  const onClinicPhotoSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image (PNG, JPG, or WebP).');
      return;
    }
    if (file.size > MAX_CLINIC_PHOTO_BYTES) {
      toast.error('Image must be about 1.5 MB or smaller.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setLogoTouched(true);
      setLogoPreview(dataUrl);
    } catch {
      toast.error('Could not read the image.');
    }
  };

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
                  flow.goNext('download');
                } catch (error: unknown) {
                  toast.error(getUserFriendlyApiError(error));
                }
              }}
              disabled={flow.savingContextDocuments || (!hasChatContext && flow.contextFiles.length === 0)}
              className="min-w-40"
            >
              {flow.savingContextDocuments ? 'Saving...' : 'Save & Continue'}
            </Button>
            <Button type="button" variant="outline" onClick={() => flow.goNext('download')} className="min-w-32">Skip for now</Button>
          </div>
        </div>
      </div>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(event) => void onClinicPhotoSelected(event)}
      />
      <input
        ref={aboutClinicFileRef}
        type="file"
        accept=".txt,.md,.csv,.json,.xml,.html,.pdf,.docx,.xlsx,text/plain,text/markdown,text/csv,application/json,text/xml,text/html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(event) => {
          if (event.target.files) {
            void flow.addContextFiles(event.target.files);
            event.target.value = '';
          }
        }}
      />

      <Card className="mt-6 border bg-card/80 shadow-sm backdrop-blur">
        <CardHeader className="space-y-1">
          <CardTitle className="text-lg">Clinic photo, website & documents</CardTitle>
          <CardDescription>
            Your website and photo are stored on your clinic profile. Upload a brochure or overview file here and it joins the same{' '}
            <span className="font-medium text-foreground">Attached files</span> list in the chat panel above for AI context.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="flex shrink-0 flex-col items-start gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Clinic photo</p>
              <div className="relative size-24 overflow-hidden rounded-xl border bg-muted">
                {logoPreview ? (
                  <img src={logoPreview} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <CameraIcon className="size-8 opacity-60" aria-hidden />
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => photoInputRef.current?.click()}>
                  {logoPreview ? 'Replace photo' : 'Upload photo'}
                </Button>
                {logoPreview ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setLogoTouched(true);
                      setLogoPreview(undefined);
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
            <Field className="min-w-0 flex-1">
              <FieldLabel className="flex items-center gap-1.5">
                <GlobeIcon className="size-3.5" aria-hidden />
                Website
              </FieldLabel>
              <Input
                type="url"
                placeholder="https://yourclinic.com"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                autoComplete="url"
              />
            </Field>
          </div>

          <div className="rounded-xl border border-dashed bg-muted/15 p-4">
            <p className="text-sm font-medium">About your clinic (file)</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Optional PDF, Word doc, or text describing your practice—processed like other context attachments.
            </p>
            <Button type="button" variant="secondary" className="mt-3" onClick={() => aboutClinicFileRef.current?.click()}>
              Choose file
            </Button>
          </div>

          <Button type="button" onClick={() => void saveClinicMaterials()} disabled={savingClinicMaterials}>
            {savingClinicMaterials ? 'Saving…' : 'Save website & photo'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function DownloadDataStep({ flow }: { flow: OnboardingFlow }) {
  const [downloading, setDownloading] = React.useState(false);

  const downloadPdf = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const token = await ensureFreshAccessToken();
      const headers: Record<string, string> = {};
      const auth = token ? { Authorization: `Bearer ${token}` } : getAuthHeaders();
      if (auth && typeof auth === 'object') {
        Object.assign(headers, auth as Record<string, string>);
      }

      const response = await fetch(`${API_BASE_URL}/onboarding/export/pdf`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Download failed: ${response.status} ${errorBody}`);
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('content-disposition') || '';
      const filenameMatch = /filename="?([^"]+)"?/i.exec(contentDisposition);
      const filename = filenameMatch?.[1] || 'clinic-context.pdf';

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('Downloaded clinic context PDF');
    } catch (error) {
      toast.error(getUserFriendlyApiError(error));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border bg-card/95 shadow-sm rounded-3xl">
        <CardHeader>
          <CardTitle className="text-xl">Download your clinic context</CardTitle>
          <CardDescription>
            This PDF includes your full onboarding configuration and saved context documents.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border bg-muted/10 p-4 text-sm text-muted-foreground">
            <p>
              Tip: If you added chat notes or uploaded files in the AI Chat step, click <span className="font-medium text-foreground">Save</span> first so they appear in the export.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={() => void downloadPdf()} disabled={downloading}>
              {downloading ? 'Preparing…' : 'Download your data'}
            </Button>
            <Button type="button" variant="outline" onClick={() => flow.goNext('test-call')}>
              Continue
            </Button>
            <Button type="button" variant="ghost" onClick={() => flow.goNext('test-call')}>
              Skip
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={flow.goBack} className="min-w-28">Back</Button>
      </div>
    </div>
  );
}

export function OnboardingCompleteStep({
  allowSuccess,
  isCheckingServer,
}: {
  allowSuccess: boolean;
  isCheckingServer?: boolean;
}) {
  const router = useRouter();

  if (isCheckingServer) {
    return (
      <Card className="border bg-card/95 shadow-sm rounded-3xl">
        <CardContent className="py-10">
          <p className="text-center text-sm text-muted-foreground">Checking your account…</p>
        </CardContent>
      </Card>
    );
  }

  if (!allowSuccess) {
    return (
      <Card className="border bg-card/95 shadow-sm rounded-3xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl">Finish onboarding first</CardTitle>
          <CardDescription>
            Publish your configuration from the review step to mark onboarding complete. Then you will see the success screen and can open the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="secondary" className="min-w-44" onClick={() => router.push('/onboarding/test-call')}>
            Back to Review &amp; Go Live
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border bg-card/95 shadow-sm rounded-3xl">
      <CardHeader className="space-y-4 text-center sm:text-left">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary sm:mx-0">
          <CheckCircle2Icon className="size-9" aria-hidden />
        </div>
        <div className="space-y-2">
          <CardTitle className="text-2xl font-semibold tracking-tight">You completed onboarding</CardTitle>
          <CardDescription className="text-base text-muted-foreground">
            Your configuration is saved and your session is ready. Use the dashboard to manage your clinic, review calls, and tune your AI receptionist anytime.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <Button type="button" className="min-w-48" size="lg" onClick={() => router.push('/dashboard')}>
          Continue to dashboard
        </Button>
      </CardContent>
    </Card>
  );
}

export function TestCallStep({ flow }: { flow: OnboardingFlow }) {
  return (
    <Card className="border bg-card/95 shadow-sm rounded-3xl">
      <CardHeader>
        <CardTitle className="text-xl">Review & Go Live</CardTitle>
        <CardDescription>Review your configuration and publish to go live</CardDescription>
      </CardHeader>
      <CardContent>
        {flow.onboardingData && (
          <div className="mb-6 space-y-3">
            <div className="flex items-center justify-between rounded-xl border bg-background/70 p-3">
              <span className="text-sm font-medium">Readiness Score</span>
              <span className="text-lg font-bold text-primary">{flow.onboardingData.readinessScore}%</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border bg-background/70 p-3">
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
              <div className="space-y-3 rounded-xl border bg-background/70 p-3">
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
            disabled={flow.publishingConfig || (flow.onboardingData && !flow.onboardingData.isReady)}
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
            {flow.publishingConfig ? 'Publishing...' : 'Publish & Go Live'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
