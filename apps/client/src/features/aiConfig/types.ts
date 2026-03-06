export interface VoiceProfile {
  id: string;
  tenantId: string;
  voiceId?: string;
  greetingMessage?: string;
  tone?: 'friendly' | 'professional' | 'formal' | 'casual' | 'warm' | 'calm';
  speechSpeed?: number;
  afterHoursMessage?: string;
  holdMusic?: string;
  language?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Service {
  id: string;
  tenantId: string;
  serviceName: string;
  category?: string;
  description?: string;
  durationMinutes?: number;
  price?: string;
  isActive?: boolean;
  sortOrder?: number;
  createdAt: string;
}

export interface BookingRules {
  id: string;
  tenantId: string;
  minNoticePeriodHours?: number;
  maxAdvanceBookingDays?: number;
  defaultAppointmentDurationMinutes?: number;
  bufferBetweenAppointmentsMinutes?: number;
  operatingSchedule?: Record<string, unknown>;
  doubleBookingPolicy?: string;
  afterHoursPolicy?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Policy {
  id: string;
  tenantId: string;
  policyType: string;
  content: string;
  createdAt: string;
}

export interface Faq {
  id: string;
  tenantId: string;
  question: string;
  answer: string;
  category?: string;
  priority?: number;
  createdAt: string;
}

export interface ConfigVersion {
  id: string;
  tenantId: string;
  version: number;
  status: string;
  snapshot: Record<string, unknown>;
  createdBy: string;
  publishedAt?: string;
  createdAt: string;
}
