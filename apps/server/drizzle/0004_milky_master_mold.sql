DO $$
BEGIN
	CREATE TYPE "public"."ai_provider_name" AS ENUM('openai', 'anthropic', 'deepgram', 'elevenlabs', 'google-stt', 'google-tts');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END
$$;--> statement-breakpoint
DO $$
BEGIN
	CREATE TYPE "public"."api_key_status" AS ENUM('active', 'revoked', 'expired');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END
$$;--> statement-breakpoint
ALTER TYPE "public"."voice_tone" ADD VALUE IF NOT EXISTS 'formal';--> statement-breakpoint
ALTER TYPE "public"."voice_tone" ADD VALUE IF NOT EXISTS 'casual';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider_name" "ai_provider_name" NOT NULL,
	"encrypted_key" text NOT NULL,
	"key_hint" text NOT NULL,
	"status" "api_key_status" DEFAULT 'active' NOT NULL,
	"label" text,
	"created_by" uuid NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_rules" ALTER COLUMN "config_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_rules" ALTER COLUMN "min_notice_hours" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_rules" ALTER COLUMN "max_future_days" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_rules" ALTER COLUMN "cancellation_cutoff_hours" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_rules" ALTER COLUMN "double_booking_policy" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_rules" ALTER COLUMN "emergency_slot_policy" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_rules" ALTER COLUMN "after_hours_policy" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "call_sessions" ALTER COLUMN "twilio_call_sid" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_profile" ALTER COLUMN "config_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_profile" ALTER COLUMN "legal_entity_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_profile" ALTER COLUMN "timezone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_profile" ALTER COLUMN "primary_phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_profile" ALTER COLUMN "support_email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "clinic_profile" ALTER COLUMN "locations" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "faq_library" ALTER COLUMN "config_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "faq_library" ALTER COLUMN "faq_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "faq_library" ALTER COLUMN "question_variants" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "faq_library" ALTER COLUMN "canonical_answer" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "faq_library" ALTER COLUMN "category" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "integrations" ALTER COLUMN "config_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "policies" ALTER COLUMN "config_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "policies" ALTER COLUMN "escalation_conditions" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "policies" ALTER COLUMN "emergency_disclaimer" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "policies" ALTER COLUMN "sensitive_topics" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "policies" ALTER COLUMN "human_callback_sla_minutes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "policies" ALTER COLUMN "compliance_flags" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ALTER COLUMN "config_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ALTER COLUMN "service_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ALTER COLUMN "service_category" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ALTER COLUMN "duration_minutes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_profile" ALTER COLUMN "config_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_profile" ALTER COLUMN "voice_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_profile" ALTER COLUMN "speaking_speed" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_profile" ALTER COLUMN "tone" SET DEFAULT 'professional';--> statement-breakpoint
ALTER TABLE "voice_profile" ALTER COLUMN "tone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_rules" ADD COLUMN IF NOT EXISTS "default_appointment_duration_minutes" integer DEFAULT 30;--> statement-breakpoint
ALTER TABLE "booking_rules" ADD COLUMN IF NOT EXISTS "buffer_between_appointments_minutes" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "booking_rules" ADD COLUMN IF NOT EXISTS "operating_schedule" jsonb;--> statement-breakpoint
ALTER TABLE "booking_rules" ADD COLUMN IF NOT EXISTS "closed_dates" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN IF NOT EXISTS "clinic_number" text;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN IF NOT EXISTS "ai_provider" text;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN IF NOT EXISTS "ai_model" text;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN IF NOT EXISTS "cost_estimate" numeric(10, 6);--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN IF NOT EXISTS "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN IF NOT EXISTS "address" text;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN IF NOT EXISTS "phone" text;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN IF NOT EXISTS "email" text;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN IF NOT EXISTS "website" text;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN IF NOT EXISTS "logo" text;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN IF NOT EXISTS "branding_colors" jsonb;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN IF NOT EXISTS "business_hours" jsonb;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN IF NOT EXISTS "specialties" jsonb;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
ALTER TABLE "faq_library" ADD COLUMN IF NOT EXISTS "question" text;--> statement-breakpoint
ALTER TABLE "faq_library" ADD COLUMN IF NOT EXISTS "answer" text;--> statement-breakpoint
ALTER TABLE "faq_library" ADD COLUMN IF NOT EXISTS "priority" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "policies" ADD COLUMN IF NOT EXISTS "policy_type" text;--> statement-breakpoint
ALTER TABLE "policies" ADD COLUMN IF NOT EXISTS "content" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "voice_profile" ADD COLUMN IF NOT EXISTS "speech_speed" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "voice_profile" ADD COLUMN IF NOT EXISTS "greeting_message" text;--> statement-breakpoint
ALTER TABLE "voice_profile" ADD COLUMN IF NOT EXISTS "after_hours_message" text;--> statement-breakpoint
ALTER TABLE "voice_profile" ADD COLUMN IF NOT EXISTS "language" text DEFAULT 'en';--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "tenant_api_keys" ADD CONSTRAINT "tenant_api_keys_tenant_id_tenant_registry_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant_registry"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END
$$;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "tenant_api_keys" ADD CONSTRAINT "tenant_api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END
$$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_api_keys_tenant_provider_active_idx" ON "tenant_api_keys" USING btree ("tenant_id","provider_name","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_api_keys_tenant_idx" ON "tenant_api_keys" USING btree ("tenant_id");--> statement-breakpoint
