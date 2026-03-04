

export const TenantStatus = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  ARCHIVED: 'archived',
} as const;
export type TenantStatus = (typeof TenantStatus)[keyof typeof TenantStatus];

export const TwilioNumberStatus = {
  ACTIVE: 'active',
  PENDING: 'pending',
  RELEASED: 'released',
} as const;
export type TwilioNumberStatus = (typeof TwilioNumberStatus)[keyof typeof TwilioNumberStatus];

export const ConfigVersionStatus = {
  DRAFT: 'draft',
  VALIDATED: 'validated',
  PUBLISHED: 'published',
  ROLLED_BACK: 'rolled_back',
} as const;
export type ConfigVersionStatus = (typeof ConfigVersionStatus)[keyof typeof ConfigVersionStatus];

export const ConfigSource = {
  ONBOARDING: 'onboarding',
  AI_CHAT: 'ai_chat',
  ADMIN_EDIT: 'admin_edit',
} as const;
export type ConfigSource = (typeof ConfigSource)[keyof typeof ConfigSource];

export const ClinicProfileStatus = {
  DRAFT: 'draft',
  VALIDATED: 'validated',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
} as const;
export type ClinicProfileStatus = (typeof ClinicProfileStatus)[keyof typeof ClinicProfileStatus];

export const ServiceCategory = {
  PREVENTIVE: 'preventive',
  RESTORATIVE: 'restorative',
  COSMETIC: 'cosmetic',
  EMERGENCY: 'emergency',
  ORTHODONTIC: 'orthodontic',
  OTHER: 'other',
} as const;
export type ServiceCategory = (typeof ServiceCategory)[keyof typeof ServiceCategory];

export const DoubleBookingPolicy = {
  FORBID: 'forbid',
  CONDITIONAL: 'conditional',
  MANUAL_REVIEW: 'manual_review',
} as const;
export type DoubleBookingPolicy = (typeof DoubleBookingPolicy)[keyof typeof DoubleBookingPolicy];

export const BookingValidationState = {
  VALID: 'valid',
  WARNING: 'warning',
  BLOCKED: 'blocked',
} as const;
export type BookingValidationState = (typeof BookingValidationState)[keyof typeof BookingValidationState];

export const VoiceTone = {
  CALM: 'calm',
  FRIENDLY: 'friendly',
  PROFESSIONAL: 'professional',
  URGENT: 'urgent',
} as const;
export type VoiceTone = (typeof VoiceTone)[keyof typeof VoiceTone];

export const FaqCategory = {
  INSURANCE: 'insurance',
  HOURS: 'hours',
  PROCEDURES: 'procedures',
  BILLING: 'billing',
  PREPARATION: 'preparation',
  OTHER: 'other',
} as const;
export type FaqCategory = (typeof FaqCategory)[keyof typeof FaqCategory];

export const IntegrationType = {
  PMS: 'pms',
  CALENDAR: 'calendar',
  CRM: 'crm',
  MESSAGING: 'messaging',
} as const;
export type IntegrationType = (typeof IntegrationType)[keyof typeof IntegrationType];

export const IntegrationStatus = {
  DISCONNECTED: 'disconnected',
  PENDING: 'pending',
  ACTIVE: 'active',
  ERROR: 'error',
} as const;
export type IntegrationStatus = (typeof IntegrationStatus)[keyof typeof IntegrationStatus];

export const HealthStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  FAILING: 'failing',
} as const;
export type HealthStatus = (typeof HealthStatus)[keyof typeof HealthStatus];

export const CallSessionStatus = {
  STARTED: 'started',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  ESCALATED: 'escalated',
  FAILED: 'failed',
} as const;
export type CallSessionStatus = (typeof CallSessionStatus)[keyof typeof CallSessionStatus];

export const ProviderType = {
  STT: 'stt',
  TTS: 'tts',
  LLM: 'llm',
} as const;
export type ProviderType = (typeof ProviderType)[keyof typeof ProviderType];

export const ProviderHealthStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  FAILING: 'failing',
  DISABLED: 'disabled',
} as const;
export type ProviderHealthStatus = (typeof ProviderHealthStatus)[keyof typeof ProviderHealthStatus];

export const CircuitBreakerState = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open',
} as const;
export type CircuitBreakerState = (typeof CircuitBreakerState)[keyof typeof CircuitBreakerState];

export const ActorType = {
  USER: 'user',
  ADMIN: 'admin',
  SYSTEM: 'system',
  INTEGRATION: 'integration',
} as const;
export type ActorType = (typeof ActorType)[keyof typeof ActorType];

export const UserRole = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MANAGER: 'manager',
  VIEWER: 'viewer',
  PLATFORM_ADMIN: 'platform_admin',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const TenantResolutionMethod = {
  JWT: 'jwt',
  PHONE_NUMBER: 'phone_number',
  API_KEY: 'api_key',
  ADMIN_OVERRIDE: 'admin_override',
} as const;
export type TenantResolutionMethod = (typeof TenantResolutionMethod)[keyof typeof TenantResolutionMethod];
