'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2Icon, PlusIcon, TrashIcon } from 'lucide-react';
import {
  useGetVoiceProfileQuery,
  useUpdateVoiceProfileMutation,
  useGetServicesQuery,
  useAddServiceMutation,
  useDeleteServiceMutation,
  useGetFaqsQuery,
  useAddFaqMutation,
  useDeleteFaqMutation,
  useGetBookingRulesQuery,
  useUpdateBookingRulesMutation,
  useGetPoliciesQuery,
  useAddPolicyMutation,
  useDeletePolicyMutation,
} from '@/features/aiConfig/aiConfigApi';
import { useGenerateVoicePreviewMutation } from '@/features/onboarding/onboardingApi';
import { VoicePreviewCard } from '@/components/voice-preview-card';
import {
  RECEPTIONIST_VOICE_OPTIONS,
  getReceptionistVoiceByAccentAndGender,
  getReceptionistVoiceById,
  type ReceptionistVoiceAccent,
  type ReceptionistVoiceGender,
} from '@/lib/voice-catalog';

export default function AiReceptionistPage() {
  // Voice profile
  const { data: voiceProfile, isLoading: voiceLoading } = useGetVoiceProfileQuery();
  const [updateVoice, { isLoading: voiceSaving }] = useUpdateVoiceProfileMutation();
  const [generateVoicePreview, { isLoading: previewGenerating }] = useGenerateVoicePreviewMutation();

  const [greeting, setGreeting] = useState('');
  const [tone, setTone] = useState<'friendly' | 'professional' | 'formal' | 'casual' | 'warm' | 'calm'>('professional');
  const [voiceId, setVoiceId] = useState(RECEPTIONIST_VOICE_OPTIONS[0].id);
  const [afterHoursMessage, setAfterHoursMessage] = useState('');
  const [language, setLanguage] = useState('en-US');
  const [selectedAccent, setSelectedAccent] = useState<ReceptionistVoiceAccent>('us');
  const [selectedGender, setSelectedGender] = useState<ReceptionistVoiceGender>('female');
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    if (voiceProfile) {
      const matchedVoice = getReceptionistVoiceById(voiceProfile.voiceId);
      setGreeting(voiceProfile.greetingMessage ?? '');
      setTone(voiceProfile.tone ?? 'professional');
      setVoiceId(matchedVoice?.id ?? voiceProfile.voiceId ?? RECEPTIONIST_VOICE_OPTIONS[0].id);
      setAfterHoursMessage(voiceProfile.afterHoursMessage ?? '');
      setLanguage(matchedVoice?.locale ?? voiceProfile.language ?? 'en-US');
      if (matchedVoice) {
        setSelectedAccent(matchedVoice.accent);
        setSelectedGender(matchedVoice.gender);
      }
    }
  }, [voiceProfile]);

  useEffect(() => {
    const selectedVoice = getReceptionistVoiceByAccentAndGender(selectedAccent, selectedGender);
    setVoiceId(selectedVoice.id);
    setTone(selectedVoice.toneValue);
    setLanguage(selectedVoice.locale);
    setPreviewAudioUrl(null);
  }, [selectedAccent, selectedGender]);

  const handleSaveVoice = async () => {
    try {
      await updateVoice({
        greetingMessage: greeting,
        tone,
        voiceId,
        afterHoursMessage,
        language,
      }).unwrap();
      toast.success('Voice profile saved');
    } catch {
      toast.error('Failed to save voice profile');
    }
  };

  // Services
  const { data: servicesData, isLoading: servicesLoading } = useGetServicesQuery();
  const services = servicesData?.data ?? [];
  const [addService, { isLoading: addingService }] = useAddServiceMutation();
  const [deleteService] = useDeleteServiceMutation();
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceDuration, setNewServiceDuration] = useState('30');

  const handleAddService = async () => {
    if (!newServiceName.trim()) return;
    try {
      await addService({
        serviceName: newServiceName,
        durationMinutes: parseInt(newServiceDuration) || 30,
        isActive: true,
      }).unwrap();
      setNewServiceName('');
      setNewServiceDuration('30');
      toast.success('Service added');
    } catch {
      toast.error('Failed to add service');
    }
  };

  // FAQs
  const { data: faqsData, isLoading: faqsLoading } = useGetFaqsQuery();
  const faqs = faqsData?.data ?? [];
  const [addFaq, { isLoading: addingFaq }] = useAddFaqMutation();
  const [deleteFaq] = useDeleteFaqMutation();
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');

  const handleAddFaq = async () => {
    if (!newQuestion.trim() || !newAnswer.trim()) return;
    try {
      await addFaq({ question: newQuestion, answer: newAnswer }).unwrap();
      setNewQuestion('');
      setNewAnswer('');
      toast.success('FAQ added');
    } catch {
      toast.error('Failed to add FAQ');
    }
  };

  // Booking rules
  const { data: bookingRules, isLoading: rulesLoading } = useGetBookingRulesQuery();
  const [updateRules, { isLoading: rulesSaving }] = useUpdateBookingRulesMutation();
  const [defaultDuration, setDefaultDuration] = useState('30');
  const [minNotice, setMinNotice] = useState('2');
  const [maxAdvance, setMaxAdvance] = useState('90');

  useEffect(() => {
    if (bookingRules) {
      setDefaultDuration(String(bookingRules.defaultAppointmentDurationMinutes ?? 30));
      setMinNotice(String(bookingRules.minNoticePeriodHours ?? 2));
      setMaxAdvance(String(bookingRules.maxAdvanceBookingDays ?? 90));
    }
  }, [bookingRules]);

  const handleSaveRules = async () => {
    try {
      await updateRules({
        defaultAppointmentDurationMinutes: parseInt(defaultDuration) || 30,
        minNoticePeriodHours: parseInt(minNotice) || 2,
        maxAdvanceBookingDays: parseInt(maxAdvance) || 90,
      }).unwrap();
      toast.success('Booking rules saved');
    } catch {
      toast.error('Failed to save booking rules');
    }
  };

  // Policies
  const { data: policiesData, isLoading: policiesLoading } = useGetPoliciesQuery();
  const policies = policiesData?.data ?? [];
  const [addPolicy, { isLoading: addingPolicy }] = useAddPolicyMutation();
  const [deletePolicy] = useDeletePolicyMutation();
  const [newPolicyType, setNewPolicyType] = useState('cancellation');
  const [newPolicyContent, setNewPolicyContent] = useState('');

  const handleAddPolicy = async () => {
    if (!newPolicyContent.trim()) return;
    try {
      await addPolicy({ policyType: newPolicyType, content: newPolicyContent }).unwrap();
      setNewPolicyContent('');
      toast.success('Policy added');
    } catch {
      toast.error('Failed to add policy');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            Configure your AI receptionist
          </h2>
          <p className="text-sm text-muted-foreground">
            Customize voice, knowledge base, and behavior
          </p>
        </div>
      </div>

      <Tabs defaultValue="voice" className="space-y-6">
        <TabsList>
          <TabsTrigger value="voice">Voice & Greeting</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="faqs">FAQs</TabsTrigger>
          <TabsTrigger value="rules">Booking Rules</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
        </TabsList>

        {/* Voice & Greeting Tab */}
        <TabsContent value="voice" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Voice & greeting</CardTitle>
              <CardDescription>
                Configure how your AI receptionist sounds and greets callers
              </CardDescription>
            </CardHeader>
            <CardContent>
              {voiceLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <FieldGroup>
                  <Field>
                    <FieldLabel>Greeting message</FieldLabel>
                    <Textarea
                      value={greeting}
                      onChange={(e) => setGreeting(e.target.value)}
                      rows={3}
                      placeholder="Hi, thank you for calling. How can I help you today?"
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Accent</FieldLabel>
                    <Select
                      value={selectedAccent}
                      onValueChange={(value) => setSelectedAccent((value as ReceptionistVoiceAccent) || 'us')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="us">US accent agent</SelectItem>
                        <SelectItem value="uk">UK accent agent</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>Voice</FieldLabel>
                    <Select
                      value={selectedGender}
                      onValueChange={(value) => setSelectedGender((value as ReceptionistVoiceGender) || 'female')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="male">Male</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {RECEPTIONIST_VOICE_OPTIONS.map((voice) => (
                      <VoicePreviewCard
                        key={voice.id}
                        voice={voice}
                        selected={voiceId === voice.id}
                        previewAudioUrl={voiceId === voice.id ? previewAudioUrl : null}
                        isGenerating={previewGenerating && voiceId === voice.id}
                        onSelect={(id) => {
                          const selectedVoice = getReceptionistVoiceById(id);
                          if (!selectedVoice) return;
                          setVoiceId(id);
                          setSelectedAccent(selectedVoice.accent);
                          setSelectedGender(selectedVoice.gender);
                          setTone(selectedVoice.toneValue);
                          setLanguage(selectedVoice.locale);
                          setPreviewAudioUrl(null);
                        }}
                        onPreview={async (id) => {
                          const previewVoice = getReceptionistVoiceById(id);
                          if (!previewVoice) return;
                          try {
                            const url = await generateVoicePreview({
                              voiceId: id,
                              text: greeting.trim() || `Hello, thank you for calling ${voiceProfile?.tenantId ? 'the clinic' : 'our clinic'}. How may I help you today?`,
                              speed: voiceProfile?.speechSpeed ?? 1,
                              language: previewVoice.locale,
                            }).unwrap();
                            setPreviewAudioUrl(url);
                          } catch {
                            toast.error('Failed to generate voice preview');
                          }
                        }}
                      />
                    ))}
                  </div>
                  <Field>
                    <FieldLabel>After-hours message</FieldLabel>
                    <Textarea
                      value={afterHoursMessage}
                      onChange={(e) => setAfterHoursMessage(e.target.value)}
                      rows={2}
                      placeholder="We're currently closed. Please leave a message..."
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Language</FieldLabel>
                    <Input
                      readOnly
                      value={language}
                      placeholder="en-US"
                    />
                  </Field>
                  <Button onClick={handleSaveVoice} disabled={voiceSaving}>
                    {voiceSaving ? (
                      <>
                        <Loader2Icon className="mr-2 size-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save voice profile'
                    )}
                  </Button>
                </FieldGroup>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Services Tab */}
        <TabsContent value="services" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Services</CardTitle>
              <CardDescription>
                Dental services your AI can book appointments for
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex gap-2">
                <Input
                  value={newServiceName}
                  onChange={(e) => setNewServiceName(e.target.value)}
                  placeholder="Service name"
                  className="flex-1"
                />
                <Input
                  value={newServiceDuration}
                  onChange={(e) => setNewServiceDuration(e.target.value)}
                  placeholder="Duration (min)"
                  type="number"
                  className="w-28"
                />
                <Button onClick={handleAddService} disabled={addingService}>
                  <PlusIcon className="mr-1 size-4" />
                  Add
                </Button>
              </div>
              {servicesLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : services.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No services configured yet
                </p>
              ) : (
                <div className="space-y-2">
                  {services.map((svc) => (
                    <div key={svc.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">{svc.serviceName}</p>
                        <p className="text-xs text-muted-foreground">
                          {svc.durationMinutes ? `${svc.durationMinutes} min` : ''}
                          {svc.price ? ` · $${svc.price}` : ''}
                          {svc.category ? ` · ${svc.category}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={svc.isActive ? 'default' : 'secondary'}>
                          {svc.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={async () => {
                            try {
                              await deleteService(svc.id).unwrap();
                              toast.success('Service removed');
                            } catch {
                              toast.error('Failed to remove service');
                            }
                          }}
                        >
                          <TrashIcon className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* FAQs Tab */}
        <TabsContent value="faqs" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Frequently asked questions</CardTitle>
              <CardDescription>
                Questions and answers your AI can reference during calls
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FieldGroup>
                <Field>
                  <FieldLabel>Question</FieldLabel>
                  <Input
                    value={newQuestion}
                    onChange={(e) => setNewQuestion(e.target.value)}
                    placeholder="What are your hours?"
                  />
                </Field>
                <Field>
                  <FieldLabel>Answer</FieldLabel>
                  <Textarea
                    value={newAnswer}
                    onChange={(e) => setNewAnswer(e.target.value)}
                    rows={2}
                    placeholder="We're open Monday through Friday, 8am to 5pm."
                  />
                </Field>
                <Button onClick={handleAddFaq} disabled={addingFaq}>
                  <PlusIcon className="mr-1 size-4" />
                  Add FAQ
                </Button>
              </FieldGroup>

              {faqsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : faqs.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No FAQs configured yet
                </p>
              ) : (
                <div className="space-y-2">
                  {faqs.map((faq) => (
                    <div key={faq.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium">{faq.question}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{faq.answer}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={async () => {
                            try {
                              await deleteFaq(faq.id).unwrap();
                              toast.success('FAQ removed');
                            } catch {
                              toast.error('Failed to remove FAQ');
                            }
                          }}
                        >
                          <TrashIcon className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Booking Rules Tab */}
        <TabsContent value="rules" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Booking rules</CardTitle>
              <CardDescription>
                Control appointment scheduling behavior
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rulesLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <FieldGroup>
                  <Field>
                    <FieldLabel>Default appointment duration (minutes)</FieldLabel>
                    <Input
                      type="number"
                      value={defaultDuration}
                      onChange={(e) => setDefaultDuration(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Minimum notice period (hours)</FieldLabel>
                    <Input
                      type="number"
                      value={minNotice}
                      onChange={(e) => setMinNotice(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Max advance booking (days)</FieldLabel>
                    <Input
                      type="number"
                      value={maxAdvance}
                      onChange={(e) => setMaxAdvance(e.target.value)}
                    />
                  </Field>
                  <Button onClick={handleSaveRules} disabled={rulesSaving}>
                    {rulesSaving ? (
                      <>
                        <Loader2Icon className="mr-2 size-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save booking rules'
                    )}
                  </Button>
                </FieldGroup>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Policies Tab */}
        <TabsContent value="policies" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Policies</CardTitle>
              <CardDescription>
                Cancellation, no-show, and other policies the AI communicates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FieldGroup>
                <Field>
                  <FieldLabel>Policy type</FieldLabel>
                  <Select value={newPolicyType} onValueChange={(v) => setNewPolicyType(v ?? 'cancellation')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cancellation">Cancellation</SelectItem>
                      <SelectItem value="no_show">No-show</SelectItem>
                      <SelectItem value="payment">Payment</SelectItem>
                      <SelectItem value="insurance">Insurance</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Content</FieldLabel>
                  <Textarea
                    value={newPolicyContent}
                    onChange={(e) => setNewPolicyContent(e.target.value)}
                    rows={2}
                    placeholder="e.g. Please cancel at least 24 hours in advance"
                  />
                </Field>
                <Button onClick={handleAddPolicy} disabled={addingPolicy}>
                  <PlusIcon className="mr-1 size-4" />
                  Add policy
                </Button>
              </FieldGroup>

              {policiesLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : policies.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No policies configured yet
                </p>
              ) : (
                <div className="space-y-2">
                  {policies.map((policy) => (
                    <div key={policy.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <Badge variant="outline" className="mb-1 capitalize">
                            {typeof policy.policyType === 'string' && policy.policyType.trim().length > 0
                              ? policy.policyType.replace(/_/g, ' ')
                              : 'general'}
                          </Badge>
                          <p className="text-sm text-muted-foreground">
                            {typeof policy.content === 'string' && policy.content.trim().length > 0
                              ? policy.content
                              : 'Policy details are stored in structured fields.'}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={async () => {
                            try {
                              await deletePolicy(policy.id).unwrap();
                              toast.success('Policy removed');
                            } catch {
                              toast.error('Failed to remove policy');
                            }
                          }}
                        >
                          <TrashIcon className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
