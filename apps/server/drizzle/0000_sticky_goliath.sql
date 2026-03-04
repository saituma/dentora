CREATE TYPE "public"."actor_type" AS ENUM('user', 'admin', 'system', 'integration');
CREATE TYPE "public"."booking_validation_state" AS ENUM('valid', 'warning', 'blocked');
CREATE TYPE "public"."call_session_status" AS ENUM('started', 'in_progress', 'completed', 'escalated', 'failed');
CREATE TYPE "public"."clinic_profile_status" AS ENUM('draft', 'validated', 'published', 'archived');
CREATE TYPE "public"."config_source" AS ENUM('onboarding', 'ai_chat', 'admin_edit');
CREATE TYPE "public"."config_version_status" AS ENUM('draft', 'validated', 'published', 'rolled_back');
CREATE TYPE "public"."double_booking_policy" AS ENUM('forbid', 'conditional', 'manual_review');
CREATE TYPE "public"."faq_category" AS ENUM('insurance', 'hours', 'procedures', 'billing', 'preparation', 'other');
CREATE TYPE "public"."health_status" AS ENUM('healthy', 'degraded', 'failing');
CREATE TYPE "public"."integration_status" AS ENUM('disconnected', 'pending', 'active', 'error');
CREATE TYPE "public"."integration_type" AS ENUM('pms', 'calendar', 'crm', 'messaging');
CREATE TYPE "public"."provider_cost_type" AS ENUM('stt', 'tts', 'llm', 'telephony');
CREATE TYPE "public"."provider_type" AS ENUM('stt', 'tts', 'llm');
CREATE TYPE "public"."service_category" AS ENUM('preventive', 'restorative', 'cosmetic', 'emergency', 'orthodontic', 'other');
CREATE TYPE "public"."tenant_plan" AS ENUM('starter', 'professional', 'enterprise');
CREATE TYPE "public"."tenant_status" AS ENUM('active', 'suspended', 'archived');
CREATE TYPE "public"."twilio_number_status" AS ENUM('active', 'pending', 'released');
CREATE TYPE "public"."user_role" AS ENUM('owner', 'admin', 'manager', 'viewer', 'platform_admin');
CREATE TYPE "public"."voice_tone" AS ENUM('calm', 'friendly', 'professional', 'urgent');
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"actor_id" uuid NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"before_state" jsonb,
	"after_state" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "booking_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"config_version" integer NOT NULL,
	"min_notice_hours" integer NOT NULL,
	"max_future_days" integer NOT NULL,
	"cancellation_cutoff_hours" integer NOT NULL,
	"double_booking_policy" "double_booking_policy" NOT NULL,
	"emergency_slot_policy" jsonb NOT NULL,
	"reschedule_limits" jsonb,
	"after_hours_policy" jsonb NOT NULL,
	"validation_state" "booking_validation_state" DEFAULT 'valid' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "call_cost_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"call_session_id" uuid NOT NULL,
	"call_cost_id" uuid,
	"provider" text NOT NULL,
	"service" text NOT NULL,
	"units" integer NOT NULL,
	"unit_cost_usd" numeric(10, 8) NOT NULL,
	"total_cost_usd" numeric(10, 6) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "call_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"call_session_id" uuid NOT NULL,
	"total_cost_usd" numeric(10, 6) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "call_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"call_session_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"latency_ms" integer,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "call_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"config_version_id" uuid,
	"twilio_number_id" uuid,
	"twilio_call_sid" text NOT NULL,
	"caller_number" text,
	"status" "call_session_status" DEFAULT 'started' NOT NULL,
	"intent_summary" text,
	"duration_seconds" integer,
	"end_reason" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);

CREATE TABLE "call_transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"call_session_id" uuid NOT NULL,
	"full_transcript" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text,
	"sentiment" text,
	"intent_detected" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "clinic_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"config_version" integer NOT NULL,
	"clinic_name" text NOT NULL,
	"legal_entity_name" text NOT NULL,
	"timezone" text NOT NULL,
	"primary_phone" text NOT NULL,
	"support_email" text NOT NULL,
	"locations" jsonb NOT NULL,
	"status" "clinic_profile_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "faq_library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"config_version" integer NOT NULL,
	"faq_key" text NOT NULL,
	"question_variants" jsonb NOT NULL,
	"canonical_answer" text NOT NULL,
	"category" "faq_category" NOT NULL,
	"escalation_if_uncertain" boolean DEFAULT false NOT NULL,
	"confidence_threshold" numeric(3, 2) DEFAULT '0.75' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"config_version" integer NOT NULL,
	"integration_type" "integration_type" NOT NULL,
	"provider" text NOT NULL,
	"status" "integration_status" DEFAULT 'disconnected' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"credentials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_sync_at" timestamp with time zone,
	"health_status" "health_status" DEFAULT 'healthy' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "platform_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"config_version" integer NOT NULL,
	"escalation_conditions" jsonb NOT NULL,
	"emergency_disclaimer" text NOT NULL,
	"sensitive_topics" jsonb NOT NULL,
	"human_callback_sla_minutes" integer NOT NULL,
	"compliance_flags" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "provider_health_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"status" "health_status" NOT NULL,
	"latency_ms" integer,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "provider_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"model" text NOT NULL,
	"input_cost_per_1k" numeric(12, 8) NOT NULL,
	"output_cost_per_1k" numeric(12, 8) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "provider_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"provider_type" "provider_type" NOT NULL,
	"api_endpoint" text NOT NULL,
	"models" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority_order" integer DEFAULT 100 NOT NULL,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"max_concurrency" integer DEFAULT 100 NOT NULL,
	"timeout_ms" integer DEFAULT 5000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_registry_name_unique" UNIQUE("name")
);

CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"config_version" integer NOT NULL,
	"service_code" text NOT NULL,
	"service_name" text NOT NULL,
	"service_category" "service_category" NOT NULL,
	"duration_minutes" integer NOT NULL,
	"new_patient_allowed" boolean DEFAULT true NOT NULL,
	"requires_staff_approval" boolean DEFAULT false NOT NULL,
	"booking_constraints" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "tenant_active_config" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"active_version_number" integer NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_by" uuid NOT NULL
);

CREATE TABLE "tenant_config_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"status" "config_version_status" DEFAULT 'draft' NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completeness_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"published_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "tenant_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_name" text NOT NULL,
	"clinic_slug" text NOT NULL,
	"plan" "tenant_plan" DEFAULT 'starter' NOT NULL,
	"status" "tenant_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_registry_clinic_slug_unique" UNIQUE("clinic_slug")
);

CREATE TABLE "tenant_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "twilio_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"phone_number_e164" text NOT NULL,
	"twilio_sid" text NOT NULL,
	"friendly_name" text,
	"capabilities" jsonb DEFAULT '{"voice":true,"sms":false}'::jsonb NOT NULL,
	"status" "twilio_number_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "twilio_numbers_phone_number_e164_unique" UNIQUE("phone_number_e164")
);

CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text,
	"role" "user_role" DEFAULT 'viewer' NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE "voice_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"config_version" integer NOT NULL,
	"voice_id" text NOT NULL,
	"speaking_speed" numeric(3, 2) NOT NULL,
	"tone" "voice_tone" NOT NULL,
	"pronunciation_hints" jsonb,
	"fallback_voice_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "booking_rules" ADD CONSTRAINT "booking_rules_tenant_id_tenant_registry_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant_registry"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "call_cost_line_items" ADD CONSTRAINT "call_cost_line_items_call_session_id_call_sessions_id_fk" FOREIGN KEY ("call_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "call_cost_line_items" ADD CONSTRAINT "call_cost_line_items_call_cost_id_call_costs_id_fk" FOREIGN KEY ("call_cost_id") REFERENCES "public"."call_costs"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "call_costs" ADD CONSTRAINT "call_costs_call_session_id_call_sessions_id_fk" FOREIGN KEY ("call_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_call_session_id_call_sessions_id_fk" FOREIGN KEY ("call_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_tenant_id_tenant_registry_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant_registry"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_twilio_number_id_twilio_numbers_id_fk" FOREIGN KEY ("twilio_number_id") REFERENCES "public"."twilio_numbers"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "call_transcripts" ADD CONSTRAINT "call_transcripts_call_session_id_call_sessions_id_fk" FOREIGN KEY ("call_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "clinic_profile" ADD CONSTRAINT "clinic_profile_tenant_id_tenant_registry_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant_registry"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "faq_library" ADD CONSTRAINT "faq_library_tenant_id_tenant_registry_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant_registry"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_tenant_id_tenant_registry_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant_registry"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "policies" ADD CONSTRAINT "policies_tenant_id_tenant_registry_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant_registry"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "provider_health_log" ADD CONSTRAINT "provider_health_log_provider_id_provider_registry_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_registry"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "provider_pricing" ADD CONSTRAINT "provider_pricing_provider_id_provider_registry_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_registry"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "services" ADD CONSTRAINT "services_tenant_id_tenant_registry_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant_registry"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "tenant_active_config" ADD CONSTRAINT "tenant_active_config_tenant_id_tenant_registry_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant_registry"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "tenant_config_versions" ADD CONSTRAINT "tenant_config_versions_tenant_id_tenant_registry_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant_registry"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_tenant_id_tenant_registry_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant_registry"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "twilio_numbers" ADD CONSTRAINT "twilio_numbers_tenant_id_tenant_registry_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant_registry"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "voice_profile" ADD CONSTRAINT "voice_profile_tenant_id_tenant_registry_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant_registry"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "audit_log_tenant_time_idx" ON "audit_log" USING btree ("tenant_id","created_at");
CREATE INDEX "audit_log_tenant_entity_idx" ON "audit_log" USING btree ("tenant_id","entity_type","entity_id");
CREATE UNIQUE INDEX "booking_rules_tenant_version_idx" ON "booking_rules" USING btree ("tenant_id","config_version");
CREATE INDEX "call_cost_line_items_tenant_session_time_idx" ON "call_cost_line_items" USING btree ("tenant_id","call_session_id","created_at");
CREATE INDEX "call_cost_line_items_tenant_service_time_idx" ON "call_cost_line_items" USING btree ("tenant_id","service","created_at");
CREATE INDEX "call_costs_tenant_time_idx" ON "call_costs" USING btree ("tenant_id","created_at");
CREATE UNIQUE INDEX "call_costs_tenant_session_idx" ON "call_costs" USING btree ("tenant_id","call_session_id");
CREATE INDEX "call_events_tenant_session_time_idx" ON "call_events" USING btree ("tenant_id","call_session_id","timestamp");
CREATE INDEX "call_events_tenant_type_time_idx" ON "call_events" USING btree ("tenant_id","event_type","timestamp");
CREATE INDEX "call_sessions_tenant_started_idx" ON "call_sessions" USING btree ("tenant_id","started_at");
CREATE INDEX "call_sessions_tenant_status_idx" ON "call_sessions" USING btree ("tenant_id","status");
CREATE INDEX "call_sessions_twilio_call_sid_idx" ON "call_sessions" USING btree ("twilio_call_sid");
CREATE INDEX "call_transcripts_tenant_session_idx" ON "call_transcripts" USING btree ("tenant_id","call_session_id");
CREATE UNIQUE INDEX "clinic_profile_tenant_version_idx" ON "clinic_profile" USING btree ("tenant_id","config_version");
CREATE INDEX "clinic_profile_tenant_status_idx" ON "clinic_profile" USING btree ("tenant_id","status");
CREATE UNIQUE INDEX "faq_library_tenant_version_key_idx" ON "faq_library" USING btree ("tenant_id","config_version","faq_key");
CREATE INDEX "faq_library_tenant_category_idx" ON "faq_library" USING btree ("tenant_id","category");
CREATE UNIQUE INDEX "integrations_tenant_version_type_provider_idx" ON "integrations" USING btree ("tenant_id","config_version","integration_type","provider");
CREATE INDEX "integrations_tenant_health_idx" ON "integrations" USING btree ("tenant_id","health_status");
CREATE UNIQUE INDEX "policies_tenant_version_idx" ON "policies" USING btree ("tenant_id","config_version");
CREATE INDEX "provider_health_log_provider_time_idx" ON "provider_health_log" USING btree ("provider_id","checked_at");
CREATE INDEX "provider_pricing_provider_model_idx" ON "provider_pricing" USING btree ("provider_id","model");
CREATE INDEX "provider_registry_type_idx" ON "provider_registry" USING btree ("provider_type");
CREATE UNIQUE INDEX "services_tenant_version_code_idx" ON "services" USING btree ("tenant_id","config_version","service_code");
CREATE INDEX "services_tenant_active_idx" ON "services" USING btree ("tenant_id","active");
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");
CREATE UNIQUE INDEX "tenant_config_versions_tenant_version_idx" ON "tenant_config_versions" USING btree ("tenant_id","version_number");
CREATE INDEX "tenant_config_versions_tenant_status_idx" ON "tenant_config_versions" USING btree ("tenant_id","status");
CREATE UNIQUE INDEX "tenant_registry_clinic_slug_idx" ON "tenant_registry" USING btree ("clinic_slug");
CREATE UNIQUE INDEX "tenant_users_tenant_user_idx" ON "tenant_users" USING btree ("tenant_id","user_id");
CREATE INDEX "tenant_users_user_idx" ON "tenant_users" USING btree ("user_id");
CREATE UNIQUE INDEX "twilio_numbers_phone_e164_idx" ON "twilio_numbers" USING btree ("phone_number_e164");
CREATE INDEX "twilio_numbers_tenant_status_idx" ON "twilio_numbers" USING btree ("tenant_id","status");
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
CREATE UNIQUE INDEX "voice_profile_tenant_version_idx" ON "voice_profile" USING btree ("tenant_id","config_version");