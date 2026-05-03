'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useConversation } from '@elevenlabs/react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { API_BASE_URL, ensureFreshAccessToken, getAuthHeaders, fetchCsrfToken } from '@/lib/api';
import {
  useCreateConversationTokenMutation,
  useCreateSignedUrlMutation,
  useLazyGetConversationDetailsQuery,
} from '@/features/elevenlabs/elevenlabsApi';
import { useGetClinicQuery } from '@/features/clinic/clinicApi';
import {
  useGetVoiceProfileQuery,
  useUpdateVoiceProfileMutation,
  useGetServicesQuery,
  useGetFaqsQuery,
  useGetPoliciesQuery,
  useGetBookingRulesQuery,
} from '@/features/aiConfig/aiConfigApi';
import { AGENT_OPTIONS } from '@/features/aiConfig/agent-options';

const DEFAULT_AGENT_NAME = 'Receptionist';

type LogEntry = {
  id: string;
  role: 'system' | 'user' | 'agent' | 'event' | 'error';
  text: string;
  ts: string;
};

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const truncate = (value: string, max = 800): string => {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
};

const formatBusinessHours = (hours?: Record<string, { start: string; end: string } | null>): string => {
  if (!hours) return '';
  const lines = WEEKDAYS.map((day) => {
    const slot = hours[day];
    if (!slot) return `${day}: closed`;
    return `${day}: ${slot.start}-${slot.end}`;
  });
  return lines.join('; ');
};

const formatServices = (services: Array<{ serviceName?: string; durationMinutes?: number; price?: string }>): string => {
  if (!services.length) return '';
  const lines = services.slice(0, 12).map((service) => {
    const parts = [service.serviceName];
    if (service.durationMinutes) parts.push(`${service.durationMinutes} min`);
    if (service.price) parts.push(`$${service.price}`);
    return parts.filter(Boolean).join(' • ');
  });
  return truncate(lines.join(' | '), 1000);
};

const formatPolicies = (
  policies: Array<{ policyType?: string | null; content?: string | null }>,
): string => {
  if (!policies.length) return '';
  const lines = policies.slice(0, 8).map((policy) => {
    const label = policy.policyType ? `${policy.policyType}: ` : '';
    return `${label}${policy.content ?? ''}`.trim();
  });
  return truncate(lines.join(' | '), 1200);
};

const formatFaqs = (faqs: Array<{ question?: string; answer?: string }>): string => {
  if (!faqs.length) return '';
  const lines = faqs.slice(0, 8).map((faq) => {
    if (!faq.question && !faq.answer) return '';
    return `Q: ${faq.question ?? ''} A: ${faq.answer ?? ''}`.trim();
  }).filter(Boolean);
  return truncate(lines.join(' | '), 1200);
};

const formatEmergencyInfo = (policies: Array<{ emergencyDisclaimer?: string | null }>): string => {
  const disclaimers = policies
    .map((policy) => policy.emergencyDisclaimer?.trim())
    .filter(Boolean);
  return truncate(disclaimers.join(' | '), 800);
};

const formatEscalationInfo = (policies: Array<{ escalationConditions?: { type?: string; content?: string } | null }>): string => {
  const lines = policies
    .map((policy) => policy.escalationConditions)
    .filter((entry): entry is { type?: string; content?: string } => Boolean(entry))
    .map((entry) => {
      const label = entry.type ? `${entry.type}: ` : '';
      return `${label}${entry.content ?? ''}`.trim();
    })
    .filter(Boolean);
  return truncate(lines.join(' | '), 800);
};

const playToolCallSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const now = context.currentTime;
    const beep = (offset: number) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = 'square';
      osc.frequency.value = 720;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.08, now + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.08);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.1);
    };
    beep(0);
    beep(0.12);
    beep(0.24);
    setTimeout(() => {
      context.close().catch(() => undefined);
    }, 500);
  } catch {
    // Ignore audio errors (autoplay restrictions, unsupported context, etc.)
  }
};

const formatBookingRules = (rules?: {
  defaultAppointmentDurationMinutes?: number | null;
  bufferBetweenAppointmentsMinutes?: number | null;
  minNoticePeriodHours?: number | null;
  maxAdvanceBookingDays?: number | null;
  closedDates?: string[] | null;
} | null): string => {
  if (!rules) return '';
  const parts = [
    rules.defaultAppointmentDurationMinutes ? `default ${rules.defaultAppointmentDurationMinutes} min` : null,
    rules.bufferBetweenAppointmentsMinutes ? `buffer ${rules.bufferBetweenAppointmentsMinutes} min` : null,
    rules.minNoticePeriodHours ? `min notice ${rules.minNoticePeriodHours} hrs` : null,
    rules.maxAdvanceBookingDays ? `max advance ${rules.maxAdvanceBookingDays} days` : null,
    rules.closedDates?.length ? `closed dates: ${rules.closedDates.length}` : null,
  ].filter(Boolean);
  return parts.join('; ');
};

const buildContextualUpdate = (input: {
  agentName?: string;
  todayDate?: string;
  currentYear?: string;
  clinicName?: string;
  staffDirectory?: string;
  clinicNotes?: string;
  uploadedContext?: string;
}) => {
  const maxContextLength = 4000;
  const safeContext = input.uploadedContext
    ? (input.uploadedContext.length > maxContextLength
      ? `${input.uploadedContext.slice(0, maxContextLength)}…`
      : input.uploadedContext)
    : '';
  const lines = [
    'Context update for the receptionist:',
    input.agentName ? `Agent name: ${input.agentName}` : null,
    input.todayDate ? `Today (clinic timezone): ${input.todayDate}` : null,
    input.currentYear ? `Current year (clinic timezone): ${input.currentYear}` : null,
    input.clinicName ? `Clinic name: ${input.clinicName}` : null,
    input.staffDirectory ? `Staff directory: ${input.staffDirectory}` : null,
    input.clinicNotes ? `Clinic notes: ${input.clinicNotes}` : null,
    safeContext ? `Uploaded clinic context: ${safeContext}` : null,
    'Instructions:',
    input.agentName
      ? `- Always introduce yourself as ${input.agentName}. Never use any other name.`
      : '- Always introduce yourself as the receptionist name provided by the user.',
    '- For appointment status, reschedule, or cancellation requests: ask only for the caller phone number. Do not ask for full name or date of birth.',
    '- After collecting the phone number, confirm whether an appointment exists for that phone and share the appointment time. If no match, say no appointment is found for that number.',
    '- When the caller gives a date without a year, always assume the current year shown above.',
    '- If that date already passed in the current year, use the next year.',
    '- Use the staff directory when asked about staff names, roles, phone numbers, or status.',
    '- If asked to connect to a staff member and their phone is listed, say you are forwarding the call to that phone (simulation in test).',
    '- Do not refuse to share staff names if they are listed in the staff directory.',
    '- If an answer is in the uploaded context, use it directly.',
  ].filter(Boolean);

  return lines.join('\n');
};

const formatMessage = (message: unknown): string => {
  if (typeof message === 'string') return message;
  if (message && typeof message === 'object') {
    const record = message as Record<string, unknown>;
    if (typeof record.text === 'string') return record.text;
    if (typeof record.message === 'string') return record.message;
  }
  try {
    return JSON.stringify(message, (_key, value) => {
      if (value instanceof Error) {
        return { name: value.name, message: value.message, stack: value.stack };
      }
      return value;
    });
  } catch {
    return 'Received message';
  }
};

export default function ElevenLabsAgentPage() {
  const [manualInput, setManualInput] = useState('');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [connectionType, setConnectionType] = useState<'webrtc' | 'websocket'>('webrtc');
  const [textOnly, setTextOnly] = useState(false);
  const [agentNameVar, setAgentNameVar] = useState(DEFAULT_AGENT_NAME);
  const [clinicNameVar, setClinicNameVar] = useState('Your Clinic');
  const conversationIdRef = useRef<string | null>(null);
  const [createToken, { isLoading: isCreatingToken }] = useCreateConversationTokenMutation();
  const [createSignedUrl, { isLoading: isCreatingSignedUrl }] = useCreateSignedUrlMutation();
  const [fetchConversationDetails] = useLazyGetConversationDetailsQuery();
  const [updateVoiceProfile, { isLoading: isSavingAgent }] = useUpdateVoiceProfileMutation();
  const { data: clinic } = useGetClinicQuery();
  const { data: voiceProfile } = useGetVoiceProfileQuery();
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const agentId = selectedAgentId;
  const { data: servicesData } = useGetServicesQuery();
  const { data: faqsData } = useGetFaqsQuery();
  const { data: policiesData } = useGetPoliciesQuery();
  const { data: bookingRules } = useGetBookingRulesQuery();

  const services = servicesData?.data ?? [];
  const faqs = faqsData?.data ?? [];
  const policies = policiesData?.data ?? [];
  const contextDocs = policies.flatMap((policy) => (
    (policy.sensitiveTopics ?? []).filter((topic) => topic?.type === 'context_document')
  ));
  const staffDirectoryDoc = contextDocs.find((doc) => doc?.title === 'Staff Directory');
  const clinicNotesDoc = contextDocs.find((doc) => doc?.title === 'Clinic Notes');
  const uploadedContext = contextDocs
    .map((doc) => `${doc?.title ?? 'Document'}: ${String(doc?.content ?? '')}`)
    .filter((value) => value.trim().length > 0)
    .join(' | ');

  useEffect(() => {
    if (clinic?.clinicName && clinicNameVar === 'Your Clinic') {
      setClinicNameVar(clinic.clinicName);
    }
  }, [clinic?.clinicName, clinicNameVar]);

  useEffect(() => {
    if (voiceProfile?.voiceAgentId) {
      setSelectedAgentId(voiceProfile.voiceAgentId);
    }
  }, [voiceProfile?.voiceAgentId]);

  const callBackend = async <T,>(path: string, body: unknown): Promise<T> => {
    const token = await ensureFreshAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const auth = token ? { Authorization: `Bearer ${token}` } : getAuthHeaders();
    if (auth && typeof auth === 'object') {
      Object.assign(headers, auth as Record<string, string>);
    }
    const csrf = await fetchCsrfToken();
    if (csrf) headers['x-csrf-token'] = csrf;

    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Request failed: ${response.status} ${errorBody}`);
    }

    return (await response.json()) as T;
  };

  const callBackendGet = async <T,>(path: string): Promise<T> => {
    const token = await ensureFreshAccessToken();
    const headers: Record<string, string> = {};
    const auth = token ? { Authorization: `Bearer ${token}` } : getAuthHeaders();
    if (auth && typeof auth === 'object') {
      Object.assign(headers, auth as Record<string, string>);
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Request failed: ${response.status} ${errorBody}`);
    }

    return (await response.json()) as T;
  };


  const appendLog = (entry: Omit<LogEntry, 'id' | 'ts'>) => {
    setLog((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ts: new Date().toISOString(),
        ...entry,
      },
    ]);
  };

  const conversation = useConversation({
    textOnly,
    clientTools: {
      list_appointments: async () => {
        playToolCallSound();
        try {
          const response = await callBackendGet<{ data: unknown }>('/appointments/upcoming');
          appendLog({ role: 'event', text: 'Loaded upcoming appointments from calendar.' });
          return JSON.stringify(response.data);
        } catch (error) {
          appendLog({ role: 'error', text: `Loading appointments failed: ${formatMessage(error)}` });
          return JSON.stringify({ error: formatMessage(error) });
        }
      },
      lookup_patient: async (params: { phoneNumber: string; dateOfBirth: string }) => {
        playToolCallSound();
        try {
          const response = await callBackend<{ data: unknown }>('/patients/lookup', params);
          appendLog({ role: 'event', text: 'Patient profile lookup completed.' });
          return JSON.stringify(response.data);
        } catch (error) {
          appendLog({ role: 'error', text: `Patient lookup failed: ${formatMessage(error)}` });
          return JSON.stringify({ error: formatMessage(error) });
        }
      },
      check_availability: async (params: {
        requestedDate: string;
        requestedTime?: string | null;
        requestedPeriod?: 'morning' | 'afternoon' | 'evening' | null;
        appointmentDurationMinutes?: number;
      }) => {
        playToolCallSound();
        try {
          const response = await callBackend<{ data: unknown }>('/appointments/availability', params);
          appendLog({ role: 'event', text: 'Availability checked against calendar.' });
          return JSON.stringify(response.data);
        } catch (error) {
          appendLog({ role: 'error', text: `Availability check failed: ${formatMessage(error)}` });
          return JSON.stringify({ error: formatMessage(error) });
        }
      },
      create_appointment: async (params: {
        startIso: string;
        endIso: string;
        fullName: string;
        age?: number;
        phoneNumber: string;
        dateOfBirth?: string | null;
        reasonForVisit: string;
      }) => {
        playToolCallSound();
        try {
          const response = await callBackend<{ data: unknown }>('/appointments/book', {
            slot: {
              startIso: params.startIso,
              endIso: params.endIso,
            },
            patient: {
              fullName: params.fullName,
              age: params.age,
              phoneNumber: params.phoneNumber,
              dateOfBirth: params.dateOfBirth ?? null,
              reasonForVisit: params.reasonForVisit,
            },
          });
          appendLog({ role: 'event', text: 'Appointment created in connected calendar.' });
          return JSON.stringify(response.data);
        } catch (error) {
          appendLog({ role: 'error', text: `Appointment creation failed: ${formatMessage(error)}` });
          return JSON.stringify({ error: formatMessage(error) });
        }
      },
      cancel_appointment: async (params: { eventId: string }) => {
        playToolCallSound();
        try {
          const response = await callBackend<{ data: { success: boolean } }>('/appointments/cancel', {
            eventId: params.eventId,
          });
          appendLog({ role: 'event', text: 'Appointment cancelled in connected calendar.' });
          return JSON.stringify(response.data);
        } catch (error) {
          appendLog({ role: 'error', text: `Appointment cancellation failed: ${formatMessage(error)}` });
          return JSON.stringify({ error: formatMessage(error) });
        }
      },
      reschedule_appointment: async (params: { eventId: string; startIso: string; endIso: string }) => {
        playToolCallSound();
        try {
          const response = await callBackend<{ data: unknown }>('/appointments/reschedule', {
            eventId: params.eventId,
            slot: {
              startIso: params.startIso,
              endIso: params.endIso,
            },
          });
          appendLog({ role: 'event', text: 'Appointment rescheduled in connected calendar.' });
          return JSON.stringify(response.data);
        } catch (error) {
          appendLog({ role: 'error', text: `Appointment reschedule failed: ${formatMessage(error)}` });
          return JSON.stringify({ error: formatMessage(error) });
        }
      },
    },
    onConnect: () => appendLog({ role: 'event', text: 'Connected to ElevenLabs.' }),
    onDisconnect: () => {
      appendLog({ role: 'event', text: 'Disconnected.' });
      const conversationId = conversationIdRef.current;
      if (!conversationId) return;
      fetchConversationDetails({ conversationId })
        .unwrap()
        .then((response) => {
          appendLog({
            role: 'event',
            text: `Conversation details: ${formatMessage(response.data)}`,
          });
        })
        .catch((error) => {
          appendLog({ role: 'error', text: `Failed to fetch conversation details: ${formatMessage(error)}` });
        });
    },
    onMessage: (message) => {
      const record = message as unknown as Record<string, unknown>;
      const role = typeof record.role === 'string' ? record.role : 'agent';
      const text = typeof record.message === 'string' ? record.message : formatMessage(message);
      appendLog({ role: role === 'user' ? 'user' : 'agent', text });
      if (role === 'user' && /hang up|hangup|end call|goodbye|stop the call|stop call|disconnect/i.test(text)) {
        appendLog({ role: 'event', text: 'Ending call on user request.' });
        void conversation.endSession();
      }
    },
    onError: (error) => {
      appendLog({ role: 'error', text: formatMessage(error) });
      toast.error('ElevenLabs conversation failed. Check your API key and agent.');
    },
    onModeChange: (mode) => appendLog({ role: 'event', text: `Mode changed: ${formatMessage(mode)}` }),
    onStatusChange: (status) => appendLog({ role: 'event', text: `Status: ${formatMessage(status)}` }),
    onDebug: (event) => appendLog({ role: 'event', text: `Debug: ${formatMessage(event)}` }),
    onAgentToolRequest: (event) => appendLog({ role: 'event', text: `Tool request: ${formatMessage(event)}` }),
    onAgentToolResponse: (event) => appendLog({ role: 'event', text: `Tool response: ${formatMessage(event)}` }),
  });

  const statusLabel = useMemo(() => {
    if (conversation.status === 'connected') return 'Connected';
    if (conversation.status === 'connecting') return 'Connecting';
    return 'Disconnected';
  }, [conversation.status]);

  const startConversation = async () => {
    if (!agentId) {
      toast.error('Select an agent voice below before starting.');
      return;
    }
    if (!textOnly) {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        toast.error('Microphone permission is required to start the receptionist.');
        return;
      }
    }

    try {
      const clinicTimezone = clinic?.timezone || 'UTC';
      const todayDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: clinicTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      const currentYear = todayDate.slice(0, 4);

      const dynamicVariables = {
        agent_name: agentNameVar.trim() || DEFAULT_AGENT_NAME,
        clinic_name: clinicNameVar.trim() || clinic?.clinicName || 'Your Clinic',
        clinic_phone: clinic?.phone ?? 'Unknown',
        clinic_email: clinic?.email ?? 'Unknown',
        clinic_address: clinic?.address ?? 'Unknown',
        clinic_website: clinic?.website ?? 'Unknown',
        clinic_timezone: clinicTimezone,
        today_date: todayDate,
        current_year: currentYear,
        clinic_description: clinic?.description ?? '',
        clinic_specialties: clinic?.specialties?.join(', ') ?? '',
        business_hours: formatBusinessHours(clinic?.businessHours),
        services_list: formatServices(services),
        policies_list: formatPolicies(policies),
        faqs_list: formatFaqs(faqs),
        booking_rules: formatBookingRules(bookingRules),
        voice_tone: voiceProfile?.tone ?? '',
        voice_language: voiceProfile?.language ?? '',
        voice_id: voiceProfile?.voiceId ?? '',
        greeting_message: voiceProfile?.greetingMessage ?? '',
        after_hours_message: voiceProfile?.afterHoursMessage ?? '',
        hold_music: voiceProfile?.holdMusic ?? '',
        emergency_disclaimer: formatEmergencyInfo(policies),
        escalation_conditions: formatEscalationInfo(policies),
        staff_directory: String(staffDirectoryDoc?.content ?? ''),
        clinic_notes: String(clinicNotesDoc?.content ?? ''),
      };

      if (connectionType === 'websocket') {
        const response = await createSignedUrl({ agentId }).unwrap();
        if (!response?.data?.signedUrl) {
          throw new Error('Signed URL missing from server response.');
        }
        const conversationIdResult = await (conversation.startSession({
          signedUrl: response.data.signedUrl,
          connectionType: 'websocket',
          dynamicVariables,
        }) as unknown as Promise<unknown>);
        const conversationId = typeof conversationIdResult === 'string' ? conversationIdResult : null;
        conversationIdRef.current = conversationId;
        if (conversationId) appendLog({ role: 'system', text: `Conversation ID: ${conversationId}` });
        conversation.sendContextualUpdate(
          buildContextualUpdate({
            agentName: dynamicVariables.agent_name,
            todayDate,
            currentYear,
            clinicName: dynamicVariables.clinic_name,
            staffDirectory: String(staffDirectoryDoc?.content ?? ''),
            clinicNotes: String(clinicNotesDoc?.content ?? ''),
            uploadedContext,
          }),
        );
      } else {
        const response = await createToken({ agentId }).unwrap();
        if (!response?.data?.token) {
          throw new Error('Conversation token missing from server response.');
        }
        const conversationIdResult = await (conversation.startSession({
          conversationToken: response.data.token,
          connectionType: 'webrtc',
          dynamicVariables,
        }) as unknown as Promise<unknown>);
        const conversationId = typeof conversationIdResult === 'string' ? conversationIdResult : null;
        conversationIdRef.current = conversationId;
        if (conversationId) appendLog({ role: 'system', text: `Conversation ID: ${conversationId}` });
        conversation.sendContextualUpdate(
          buildContextualUpdate({
            agentName: dynamicVariables.agent_name,
            todayDate,
            currentYear,
            clinicName: dynamicVariables.clinic_name,
            staffDirectory: String(staffDirectoryDoc?.content ?? ''),
            clinicNotes: String(clinicNotesDoc?.content ?? ''),
            uploadedContext,
          }),
        );
      }
      appendLog({ role: 'system', text: `Session started for ${agentNameVar.trim() || DEFAULT_AGENT_NAME}.` });
    } catch (error) {
      if (connectionType === 'webrtc') {
        appendLog({ role: 'event', text: 'WebRTC failed, retrying with WebSocket.' });
        try {
          const response = await createSignedUrl({ agentId }).unwrap();
          if (!response?.data?.signedUrl) {
            throw new Error('Signed URL missing from server response.');
          }
          await conversation.startSession({
            signedUrl: response.data.signedUrl,
            connectionType: 'websocket',
          });
          setConnectionType('websocket');
          appendLog({ role: 'system', text: `Session started for ${agentNameVar.trim() || DEFAULT_AGENT_NAME} (WebSocket).` });
          return;
        } catch (fallbackError) {
          appendLog({ role: 'error', text: formatMessage(fallbackError) });
        }
      }
      appendLog({ role: 'error', text: formatMessage(error) });
      toast.error('Failed to start ElevenLabs session.');
    }
  };

  const saveAgentVoice = async () => {
    if (!selectedAgentId) {
      toast.error('Select an agent voice first.');
      return;
    }
    try {
      await updateVoiceProfile({ voiceAgentId: selectedAgentId }).unwrap();
      toast.success('Agent voice saved');
    } catch {
      toast.error('Failed to save agent voice');
    }
  };

  const stopConversation = async () => {
    try {
      await conversation.endSession();
      appendLog({ role: 'system', text: 'Session ended.' });
    } catch (error) {
      appendLog({ role: 'error', text: formatMessage(error) });
    }
  };

  const sendMessage = () => {
    const text = manualInput.trim();
    if (!text) return;
    conversation.sendUserMessage(text);
    appendLog({ role: 'user', text });
    setManualInput('');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>ElevenLabs Conversational Agent</CardTitle>
          <CardDescription>
            Live voice session with the {agentNameVar.trim() || DEFAULT_AGENT_NAME} agent using ElevenLabs WebRTC.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <Badge variant="outline">{statusLabel}</Badge>
            <span className="text-sm text-muted-foreground max-w-full truncate" title={agentId || 'Not set'}>
              Agent ID: {agentId || 'Not set'}
            </span>
            <span className="text-sm text-muted-foreground">
              Agent state: {conversation.isSpeaking ? 'speaking' : 'listening'}
            </span>
            {connectionType === 'webrtc' ? (
              <span className="text-xs text-amber-600">
                WebRTC may error in some environments. Use WebSocket if it fails.
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="w-full sm:w-64">
              <Select
                value={selectedAgentId}
                onValueChange={(value) => setSelectedAgentId(value ?? '')}
                disabled={conversation.status === 'connected'}
              >
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
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={saveAgentVoice}
              disabled={isSavingAgent || conversation.status === 'connected'}
            >
              {isSavingAgent ? 'Saving...' : 'Save agent voice'}
            </Button>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="w-full sm:w-44">
              <Select
                value={connectionType}
                onValueChange={(value) => setConnectionType(value as 'webrtc' | 'websocket')}
                disabled={conversation.status === 'connected'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Connection" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="webrtc">WebRTC</SelectItem>
                  <SelectItem value="websocket">WebSocket</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={textOnly}
                onCheckedChange={(value) => setTextOnly(Boolean(value))}
                disabled={conversation.status === 'connected'}
              />
              Text-only mode
            </label>
            <Button
              onClick={startConversation}
              disabled={
                conversation.status === 'connected' ||
                isCreatingToken ||
                isCreatingSignedUrl
              }
            >
              {(isCreatingToken || isCreatingSignedUrl) ? 'Starting...' : 'Start'}
            </Button>
            <Button
              variant="outline"
              onClick={stopConversation}
              disabled={conversation.status !== 'connected'}
            >
              Stop
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Agent Name Variable</label>
              <Input
                value={agentNameVar}
                onChange={(event) => setAgentNameVar(event.target.value)}
                placeholder="Receptionist"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Clinic Name Variable</label>
              <Input
                value={clinicNameVar}
                onChange={(event) => setClinicNameVar(event.target.value)}
                placeholder="Your Clinic"
                disabled={Boolean(clinic?.clinicName)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={manualInput}
              onChange={(event) => setManualInput(event.target.value)}
              placeholder="Send a text message to the agent..."
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  sendMessage();
                }
              }}
            />
            <Button
              onClick={sendMessage}
              variant="secondary"
              disabled={!manualInput.trim() || conversation.status !== 'connected'}
            >
              Send
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session Log</CardTitle>
          <CardDescription>Streaming events from the ElevenLabs agent session.</CardDescription>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">No session activity yet.</p>
          ) : (
            <div className="max-h-[420px] space-y-3 overflow-y-auto text-sm">
              {log.map((entry) => (
                <div key={entry.id} className="rounded-md border border-muted/60 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="uppercase tracking-wide">{entry.role}</span>
                    <span>{new Date(entry.ts).toLocaleTimeString()}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-foreground">{entry.text}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
