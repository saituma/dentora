
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const tenantStatusEnum = pgEnum('tenant_status', ['active', 'suspended', 'archived']);
export const twilioNumberStatusEnum = pgEnum('twilio_number_status', ['active', 'pending', 'released']);
export const configVersionStatusEnum = pgEnum('config_version_status', ['draft', 'validated', 'published', 'rolled_back']);
export const configSourceEnum = pgEnum('config_source', ['onboarding', 'ai_chat', 'admin_edit']);
export const clinicProfileStatusEnum = pgEnum('clinic_profile_status', ['draft', 'validated', 'published', 'archived']);
export const serviceCategoryEnum = pgEnum('service_category', ['preventive', 'restorative', 'cosmetic', 'emergency', 'orthodontic', 'other']);
export const doubleBookingPolicyEnum = pgEnum('double_booking_policy', ['forbid', 'conditional', 'manual_review']);
export const bookingValidationStateEnum = pgEnum('booking_validation_state', ['valid', 'warning', 'blocked']);
export const voiceToneEnum = pgEnum('voice_tone', ['calm', 'friendly', 'professional', 'urgent', 'formal', 'casual']);
export const faqCategoryEnum = pgEnum('faq_category', ['insurance', 'hours', 'procedures', 'billing', 'preparation', 'other']);
export const integrationTypeEnum = pgEnum('integration_type', ['pms', 'calendar', 'crm', 'messaging']);
export const integrationStatusEnum = pgEnum('integration_status', ['disconnected', 'pending', 'active', 'error']);
export const healthStatusEnum = pgEnum('health_status', ['healthy', 'degraded', 'failing']);
export const callSessionStatusEnum = pgEnum('call_session_status', ['started', 'in_progress', 'completed', 'escalated', 'failed']);
export const providerTypeEnum = pgEnum('provider_type', ['stt', 'tts', 'llm']);
export const providerCostTypeEnum = pgEnum('provider_cost_type', ['stt', 'tts', 'llm', 'telephony']);
export const actorTypeEnum = pgEnum('actor_type', ['user', 'admin', 'system', 'integration']);
export const userRoleEnum = pgEnum('user_role', ['owner', 'admin', 'manager', 'viewer', 'platform_admin']);

export const tenantPlanEnum = pgEnum('tenant_plan', ['starter', 'professional', 'enterprise']);

export const apiKeyStatusEnum = pgEnum('api_key_status', ['active', 'revoked', 'expired']);
export const aiProviderNameEnum = pgEnum('ai_provider_name', ['openai', 'anthropic', 'deepgram', 'elevenlabs', 'google-stt', 'google-tts']);

export const tenantRegistry = pgTable('tenant_registry', {
  id: uuid('id').primaryKey().defaultRandom(),
  clinicName: text('clinic_name').notNull(),
  clinicSlug: text('clinic_slug').notNull().unique(),
  plan: tenantPlanEnum('plan').notNull().default('starter'),
  status: tenantStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('tenant_registry_clinic_slug_idx').on(table.clinicSlug),
]);

export const twilioNumbers = pgTable('twilio_numbers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenantRegistry.id),
  phoneNumber: text('phone_number_e164').notNull().unique(),
  twilioSid: text('twilio_sid').notNull(),
  friendlyName: text('friendly_name'),
  capabilities: jsonb('capabilities').notNull().default({ voice: true, sms: false }),
  status: twilioNumberStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('twilio_numbers_phone_e164_idx').on(table.phoneNumber),
  index('twilio_numbers_tenant_status_idx').on(table.tenantId, table.status),
]);

export const clinicProfile = pgTable('clinic_profile', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenantRegistry.id),
  configVersion: integer('config_version'),
  clinicName: text('clinic_name').notNull(),
  legalEntityName: text('legal_entity_name'),
  timezone: text('timezone'),
  primaryPhone: text('primary_phone'),
  supportEmail: text('support_email'),
  locations: jsonb('locations'),
  address: text('address'),
  phone: text('phone'),
  email: text('email'),
  website: text('website'),
  logo: text('logo'),
  brandingColors: jsonb('branding_colors'),
  businessHours: jsonb('business_hours'),
  specialties: jsonb('specialties'),
  description: text('description'),
  status: clinicProfileStatusEnum('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('clinic_profile_tenant_version_idx').on(table.tenantId, table.configVersion),
  index('clinic_profile_tenant_status_idx').on(table.tenantId, table.status),
]);

export const services = pgTable('services', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenantRegistry.id),
  configVersion: integer('config_version'),
  serviceCode: text('service_code'),
  serviceName: text('service_name').notNull(),
  category: serviceCategoryEnum('service_category'),
  durationMinutes: integer('duration_minutes'),
  description: text('description'),
  price: numeric('price', { precision: 10, scale: 2 }),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('active').notNull().default(true),
  newPatientAllowed: boolean('new_patient_allowed').notNull().default(true),
  requiresStaffApproval: boolean('requires_staff_approval').notNull().default(false),
  bookingConstraints: jsonb('booking_constraints').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('services_tenant_version_code_idx').on(table.tenantId, table.configVersion, table.serviceCode),
  index('services_tenant_active_idx').on(table.tenantId, table.isActive),
]);

export const bookingRules = pgTable('booking_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenantRegistry.id),
  configVersion: integer('config_version'),
  minNoticePeriodHours: integer('min_notice_hours'),
  maxAdvanceBookingDays: integer('max_future_days'),
  cancellationCutoffHours: integer('cancellation_cutoff_hours'),
  defaultAppointmentDurationMinutes: integer('default_appointment_duration_minutes').default(30),
  bufferBetweenAppointmentsMinutes: integer('buffer_between_appointments_minutes').default(0),
  operatingSchedule: jsonb('operating_schedule'),
  closedDates: jsonb('closed_dates').notNull().default([]),
  doubleBookingPolicy: doubleBookingPolicyEnum('double_booking_policy'),
  emergencySlotPolicy: jsonb('emergency_slot_policy'),
  rescheduleLimits: jsonb('reschedule_limits'),
  afterHoursPolicy: jsonb('after_hours_policy'),
  validationState: bookingValidationStateEnum('validation_state').notNull().default('valid'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('booking_rules_tenant_version_idx').on(table.tenantId, table.configVersion),
]);

export const policies = pgTable('policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenantRegistry.id),
  configVersion: integer('config_version'),
  policyType: text('policy_type'),
  content: text('content'),
  escalationConditions: jsonb('escalation_conditions'),
  emergencyDisclaimer: text('emergency_disclaimer'),
  sensitiveTopics: jsonb('sensitive_topics'),
  humanCallbackSlaMinutes: integer('human_callback_sla_minutes'),
  complianceFlags: jsonb('compliance_flags'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('policies_tenant_version_idx').on(table.tenantId, table.configVersion),
]);

export const voiceProfile = pgTable('voice_profile', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenantRegistry.id),
  configVersion: integer('config_version'),
  voiceId: text('voice_id'),
  speakingSpeed: numeric('speaking_speed', { precision: 3, scale: 2 }),
  speechSpeed: numeric('speech_speed', { precision: 3, scale: 2 }),
  tone: voiceToneEnum('tone').default('professional'),
  greetingMessage: text('greeting_message'),
  afterHoursMessage: text('after_hours_message'),
  language: text('language').default('en'),
  pronunciationHints: jsonb('pronunciation_hints'),
  fallbackVoiceId: text('fallback_voice_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('voice_profile_tenant_version_idx').on(table.tenantId, table.configVersion),
]);

export const faqLibrary = pgTable('faq_library', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenantRegistry.id),
  configVersion: integer('config_version'),
  faqKey: text('faq_key'),
  question: text('question'),
  answer: text('answer'),
  priority: integer('priority').default(0),
  questionVariants: jsonb('question_variants'),
  canonicalAnswer: text('canonical_answer'),
  category: faqCategoryEnum('category'),
  escalationIfUncertain: boolean('escalation_if_uncertain').notNull().default(false),
  confidenceThreshold: numeric('confidence_threshold', { precision: 3, scale: 2 }).notNull().default('0.75'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('faq_library_tenant_version_key_idx').on(table.tenantId, table.configVersion, table.faqKey),
  index('faq_library_tenant_category_idx').on(table.tenantId, table.category),
]);

export const integrations = pgTable('integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenantRegistry.id),
  configVersion: integer('config_version'),
  integrationType: integrationTypeEnum('integration_type').notNull(),
  provider: text('provider').notNull(),
  status: integrationStatusEnum('status').notNull().default('disconnected'),
  config: jsonb('config').notNull().default({}),
  credentials: jsonb('credentials').notNull().default({}),
  capabilities: jsonb('capabilities').notNull().default({}),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  healthStatus: healthStatusEnum('health_status').notNull().default('healthy'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('integrations_tenant_version_type_provider_idx').on(
    table.tenantId, table.configVersion, table.integrationType, table.provider,
  ),
  index('integrations_tenant_health_idx').on(table.tenantId, table.healthStatus),
]);

export const tenantConfigVersions = pgTable('tenant_config_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenantRegistry.id),
  version: integer('version_number').notNull(),
  status: configVersionStatusEnum('status').notNull().default('draft'),
  snapshot: jsonb('snapshot').notNull().default({}),
  completenessScore: numeric('completeness_score', { precision: 5, scale: 2 }).notNull().default('0'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('tenant_config_versions_tenant_version_idx').on(table.tenantId, table.version),
  index('tenant_config_versions_tenant_status_idx').on(table.tenantId, table.status),
]);

export const tenantActiveConfig = pgTable('tenant_active_config', {
  tenantId: uuid('tenant_id').primaryKey().references(() => tenantRegistry.id),
  activeVersion: integer('active_version_number').notNull(),
  activatedAt: timestamp('activated_at', { withTimezone: true }).notNull().defaultNow(),
  activatedBy: uuid('activated_by').notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  role: userRoleEnum('role').notNull().default('viewer'),
  emailVerified: boolean('email_verified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('users_email_idx').on(table.email),
]);

export const tenantUsers = pgTable('tenant_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenantRegistry.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  role: userRoleEnum('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('tenant_users_tenant_user_idx').on(table.tenantId, table.userId),
  index('tenant_users_user_idx').on(table.userId),
]);

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  refreshToken: text('refresh_token').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  userAgent: text('user_agent'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('sessions_user_idx').on(table.userId),
]);

export const callSessions = pgTable('call_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenantRegistry.id),
  configVersionId: uuid('config_version_id'),
  twilioNumberId: uuid('twilio_number_id').references(() => twilioNumbers.id),
  twilioCallSid: text('twilio_call_sid'),
  callerNumber: text('caller_number'),
  clinicNumber: text('clinic_number'),
  status: callSessionStatusEnum('status').notNull().default('started'),
  intentSummary: text('intent_summary'),
  durationSeconds: integer('duration_seconds'),
  endReason: text('end_reason'),
  aiProvider: text('ai_provider'),
  aiModel: text('ai_model'),
  costEstimate: numeric('cost_estimate', { precision: 10, scale: 6 }),
  metadata: jsonb('metadata'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
}, (table) => [
  index('call_sessions_tenant_started_idx').on(table.tenantId, table.startedAt),
  index('call_sessions_tenant_status_idx').on(table.tenantId, table.status),
  index('call_sessions_twilio_call_sid_idx').on(table.twilioCallSid),
]);

export const callEvents = pgTable('call_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  callSessionId: uuid('call_session_id').notNull().references(() => callSessions.id),
  eventType: text('event_type').notNull(),
  actor: text('actor'),
  payload: jsonb('payload').notNull().default({}),
  latencyMs: integer('latency_ms'),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('call_events_tenant_session_time_idx').on(table.tenantId, table.callSessionId, table.timestamp),
  index('call_events_tenant_type_time_idx').on(table.tenantId, table.eventType, table.timestamp),
]);

export const callCosts = pgTable('call_costs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  callSessionId: uuid('call_session_id').notNull().references(() => callSessions.id),
  totalCost: numeric('total_cost_usd', { precision: 10, scale: 6 }).notNull(),
  currency: text('currency').notNull().default('USD'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('call_costs_tenant_time_idx').on(table.tenantId, table.createdAt),
  uniqueIndex('call_costs_tenant_session_idx').on(table.tenantId, table.callSessionId),
]);

export const callCostLineItems = pgTable('call_cost_line_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  callSessionId: uuid('call_session_id').notNull().references(() => callSessions.id),
  callCostId: uuid('call_cost_id').references(() => callCosts.id),
  provider: text('provider').notNull(),
  service: text('service').notNull(),
  units: integer('units').notNull(),
  unitCost: numeric('unit_cost_usd', { precision: 10, scale: 8 }).notNull(),
  totalCost: numeric('total_cost_usd', { precision: 10, scale: 6 }).notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('call_cost_line_items_tenant_session_time_idx').on(table.tenantId, table.callSessionId, table.createdAt),
  index('call_cost_line_items_tenant_service_time_idx').on(table.tenantId, table.service, table.createdAt),
]);

export const callTranscripts = pgTable('call_transcripts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  callSessionId: uuid('call_session_id').notNull().references(() => callSessions.id),
  fullTranscript: jsonb('full_transcript').notNull().default([]),
  summary: text('summary'),
  sentiment: text('sentiment'),
  intentDetected: text('intent_detected'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('call_transcripts_tenant_session_idx').on(table.tenantId, table.callSessionId),
]);

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  actorId: uuid('actor_id').notNull(),
  actorType: actorTypeEnum('actor_type').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id'),
  beforeState: jsonb('before_state'),
  afterState: jsonb('after_state'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('audit_log_tenant_time_idx').on(table.tenantId, table.createdAt),
  index('audit_log_tenant_entity_idx').on(table.tenantId, table.entityType, table.entityId),
]);

export const providerRegistry = pgTable('provider_registry', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  providerType: providerTypeEnum('provider_type').notNull(),
  apiEndpoint: text('api_endpoint').notNull(),
  models: jsonb('models').notNull().default([]),
  isActive: boolean('is_active').notNull().default(true),
  priorityOrder: integer('priority_order').notNull().default(100),
  capabilities: jsonb('capabilities').notNull().default({}),
  maxConcurrency: integer('max_concurrency').notNull().default(100),
  timeoutMs: integer('timeout_ms').notNull().default(5000),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('provider_registry_type_idx').on(table.providerType),
]);

export const providerHealthLog = pgTable('provider_health_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerId: uuid('provider_id').notNull().references(() => providerRegistry.id),
  status: healthStatusEnum('status').notNull(),
  latencyMs: integer('latency_ms'),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata').notNull().default({}),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('provider_health_log_provider_time_idx').on(table.providerId, table.checkedAt),
]);

export const providerPricing = pgTable('provider_pricing', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerId: uuid('provider_id').notNull().references(() => providerRegistry.id),
  model: text('model').notNull(),
  inputCostPer1k: numeric('input_cost_per_1k', { precision: 12, scale: 8 }).notNull(),
  outputCostPer1k: numeric('output_cost_per_1k', { precision: 12, scale: 8 }).notNull(),
  currency: text('currency').notNull().default('USD'),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
  effectiveUntil: timestamp('effective_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('provider_pricing_provider_model_idx').on(table.providerId, table.model),
]);

export const platformConfig = pgTable('platform_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  description: text('description'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenantApiKeys = pgTable('tenant_api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenantRegistry.id),
  providerName: aiProviderNameEnum('provider_name').notNull(),
  encryptedKey: text('encrypted_key').notNull(),
  keyHint: text('key_hint').notNull(),
  status: apiKeyStatusEnum('status').notNull().default('active'),
  label: text('label'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('tenant_api_keys_tenant_provider_active_idx').on(table.tenantId, table.providerName, table.status),
  index('tenant_api_keys_tenant_idx').on(table.tenantId),
]);

export const tenantApiKeysRelations = relations(tenantApiKeys, ({ one }) => ({
  tenant: one(tenantRegistry, { fields: [tenantApiKeys.tenantId], references: [tenantRegistry.id] }),
  createdByUser: one(users, { fields: [tenantApiKeys.createdBy], references: [users.id] }),
}));

export const tenantRegistryRelations = relations(tenantRegistry, ({ many }) => ({
  twilioNumbers: many(twilioNumbers),
  clinicProfiles: many(clinicProfile),
  services: many(services),
  bookingRules: many(bookingRules),
  policies: many(policies),
  voiceProfiles: many(voiceProfile),
  faqs: many(faqLibrary),
  integrations: many(integrations),
  configVersions: many(tenantConfigVersions),
  tenantUsers: many(tenantUsers),
  callSessions: many(callSessions),
  apiKeys: many(tenantApiKeys),
}));

export const twilioNumbersRelations = relations(twilioNumbers, ({ one }) => ({
  tenant: one(tenantRegistry, { fields: [twilioNumbers.tenantId], references: [tenantRegistry.id] }),
}));

export const clinicProfileRelations = relations(clinicProfile, ({ one }) => ({
  tenant: one(tenantRegistry, { fields: [clinicProfile.tenantId], references: [tenantRegistry.id] }),
}));

export const servicesRelations = relations(services, ({ one }) => ({
  tenant: one(tenantRegistry, { fields: [services.tenantId], references: [tenantRegistry.id] }),
}));

export const bookingRulesRelations = relations(bookingRules, ({ one }) => ({
  tenant: one(tenantRegistry, { fields: [bookingRules.tenantId], references: [tenantRegistry.id] }),
}));

export const policiesRelations = relations(policies, ({ one }) => ({
  tenant: one(tenantRegistry, { fields: [policies.tenantId], references: [tenantRegistry.id] }),
}));

export const voiceProfileRelations = relations(voiceProfile, ({ one }) => ({
  tenant: one(tenantRegistry, { fields: [voiceProfile.tenantId], references: [tenantRegistry.id] }),
}));

export const faqLibraryRelations = relations(faqLibrary, ({ one }) => ({
  tenant: one(tenantRegistry, { fields: [faqLibrary.tenantId], references: [tenantRegistry.id] }),
}));

export const integrationsRelations = relations(integrations, ({ one }) => ({
  tenant: one(tenantRegistry, { fields: [integrations.tenantId], references: [tenantRegistry.id] }),
}));

export const tenantConfigVersionsRelations = relations(tenantConfigVersions, ({ one }) => ({
  tenant: one(tenantRegistry, { fields: [tenantConfigVersions.tenantId], references: [tenantRegistry.id] }),
}));

export const tenantActiveConfigRelations = relations(tenantActiveConfig, ({ one }) => ({
  tenant: one(tenantRegistry, { fields: [tenantActiveConfig.tenantId], references: [tenantRegistry.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  tenantUsers: many(tenantUsers),
  sessions: many(sessions),
}));

export const tenantUsersRelations = relations(tenantUsers, ({ one }) => ({
  tenant: one(tenantRegistry, { fields: [tenantUsers.tenantId], references: [tenantRegistry.id] }),
  user: one(users, { fields: [tenantUsers.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const callSessionsRelations = relations(callSessions, ({ one, many }) => ({
  tenant: one(tenantRegistry, { fields: [callSessions.tenantId], references: [tenantRegistry.id] }),
  twilioNumber: one(twilioNumbers, { fields: [callSessions.twilioNumberId], references: [twilioNumbers.id] }),
  events: many(callEvents),
  costs: many(callCosts),
  costLineItems: many(callCostLineItems),
  transcripts: many(callTranscripts),
}));

export const callEventsRelations = relations(callEvents, ({ one }) => ({
  callSession: one(callSessions, { fields: [callEvents.callSessionId], references: [callSessions.id] }),
}));

export const callCostsRelations = relations(callCosts, ({ one, many }) => ({
  callSession: one(callSessions, { fields: [callCosts.callSessionId], references: [callSessions.id] }),
  lineItems: many(callCostLineItems),
}));

export const callCostLineItemsRelations = relations(callCostLineItems, ({ one }) => ({
  callSession: one(callSessions, { fields: [callCostLineItems.callSessionId], references: [callSessions.id] }),
  callCost: one(callCosts, { fields: [callCostLineItems.callCostId], references: [callCosts.id] }),
}));

export const callTranscriptsRelations = relations(callTranscripts, ({ one }) => ({
  callSession: one(callSessions, { fields: [callTranscripts.callSessionId], references: [callSessions.id] }),
}));

export const providerRegistryRelations = relations(providerRegistry, ({ many }) => ({
  healthLogs: many(providerHealthLog),
  pricing: many(providerPricing),
}));

export const providerHealthLogRelations = relations(providerHealthLog, ({ one }) => ({
  provider: one(providerRegistry, { fields: [providerHealthLog.providerId], references: [providerRegistry.id] }),
}));

export const providerPricingRelations = relations(providerPricing, ({ one }) => ({
  provider: one(providerRegistry, { fields: [providerPricing.providerId], references: [providerRegistry.id] }),
}));
