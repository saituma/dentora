-- Migration: Add tenant_api_keys table for encrypted provider API key storage
-- This enables tenant-specific API key overrides for AI providers.

CREATE TYPE "public"."api_key_status" AS ENUM('active', 'revoked', 'expired');
CREATE TYPE "public"."ai_provider_name" AS ENUM('openai', 'anthropic', 'deepgram', 'elevenlabs', 'google-stt', 'google-tts');

CREATE TABLE "tenant_api_keys" (
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
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_api_keys_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant_registry"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
	CONSTRAINT "tenant_api_keys_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "tenant_api_keys_tenant_provider_active_idx" ON "tenant_api_keys" USING btree ("tenant_id","provider_name","status");
CREATE INDEX "tenant_api_keys_tenant_idx" ON "tenant_api_keys" USING btree ("tenant_id");
