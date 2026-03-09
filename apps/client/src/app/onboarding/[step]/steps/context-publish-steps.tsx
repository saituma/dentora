import { UploadIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getUserFriendlyApiError } from '@/lib/api-error';
import type { OnboardingFlow } from '../use-onboarding-flow';
import { STEP_ORDER } from '../onboarding-types';

export function AiChatStep({ flow }: { flow: OnboardingFlow }) {
  return (
    <Card className="border-0 bg-card shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">AI context files</CardTitle>
        <CardDescription>Upload documents, SOPs, and reference notes so the receptionist can use them as extra clinic context.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4 rounded-2xl border bg-muted/10 p-4 sm:p-5">
            <div className="rounded-xl border bg-background p-4">
              <p className="text-sm font-medium">Upload AI context files</p>
              <p className="mt-2 text-sm text-muted-foreground">Drag and drop reference material like SOPs, call scripts, pricing notes, insurance notes, or clinic policies. Supported file types: TXT, MD, CSV, JSON, XML, and HTML.</p>
            </div>
            <input
              ref={flow.fileInputRef}
              type="file"
              multiple
              accept=".txt,.md,.csv,.json,.xml,.html,text/plain,text/markdown,text/csv,application/json,text/xml,text/html"
              className="hidden"
              onChange={(event) => {
                if (event.target.files) {
                  void flow.addContextFiles(event.target.files);
                  event.target.value = '';
                }
              }}
            />
            <button
              type="button"
              onClick={() => flow.fileInputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                flow.setIsDraggingContextFiles(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                flow.setIsDraggingContextFiles(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                flow.setIsDraggingContextFiles(false);
                void flow.addContextFiles(event.dataTransfer.files);
              }}
              className={`flex min-h-[220px] w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${flow.isDraggingContextFiles ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/40'}`}
            >
              <UploadIcon className="mb-4 size-10 text-primary" />
              <p className="text-base font-medium">Drop files here</p>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">Or click to browse and upload documents that should shape how the receptionist answers callers.</p>
            </button>
            <div className="rounded-xl border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Files ready for AI context</p>
                <Badge variant="outline">{flow.contextFiles.length} file{flow.contextFiles.length === 1 ? '' : 's'}</Badge>
              </div>
              {flow.contextFiles.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No files uploaded yet. Add files here instead of chatting with the assistant.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {flow.contextFiles.map((file) => (
                    <div key={file.id} className="rounded-lg border bg-muted/20 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{file.name}</p>
                          <p className="text-xs text-muted-foreground">{file.mimeType || 'text/plain'} · {Math.max(1, Math.round(file.size / 1024))} KB</p>
                        </div>
                        <Button type="button" size="icon" variant="ghost" onClick={() => flow.setContextFiles((prev) => prev.filter((item) => item.id !== file.id))}>
                          <XIcon className="size-4" />
                        </Button>
                      </div>
                      <p className="mt-3 line-clamp-4 text-sm text-muted-foreground">{file.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl border bg-muted/20 p-4">
              <p className="text-sm font-medium">Best results</p>
              <p className="mt-2 text-sm text-muted-foreground">Upload structured notes the receptionist should follow, such as cancellation rules, same-day emergency handling, payment notes, location details, and escalation instructions.</p>
            </div>
            <Field>
              <FieldLabel>AI context about your clinic</FieldLabel>
              <div className="max-h-[520px] overflow-y-auto rounded-2xl border bg-muted/20 p-4 text-sm">
                <pre className="whitespace-pre-wrap font-mono text-xs leading-6 text-muted-foreground">{flow.configuratorContext}</pre>
              </div>
            </Field>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={flow.goBack} className="min-w-28">Back</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                try {
                  await flow.saveContextDocuments({
                    documents: flow.contextFiles.map((file) => ({ name: file.name, content: file.content, mimeType: file.mimeType })),
                  }).unwrap();
                  toast.success('AI context files saved');
                  flow.goNext('test-call');
                } catch (error: unknown) {
                  toast.error(getUserFriendlyApiError(error));
                }
              }}
              disabled={flow.savingContextDocuments || flow.contextFiles.length === 0}
              className="min-w-40"
            >
              {flow.savingContextDocuments ? 'Saving...' : 'Save & Continue'}
            </Button>
            <Button type="button" variant="outline" onClick={() => flow.goNext('test-call')} className="min-w-32">Skip for now</Button>
          </div>
        </div>
      </CardContent>
    </Card>
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
