CREATE TYPE "public"."reminder_channel" AS ENUM('sms', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('pending', 'sent', 'failed', 'skipped', 'cancelled');--> statement-breakpoint
CREATE TABLE "appointment_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"channel" "reminder_channel" NOT NULL,
	"offset_hours" integer NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" "reminder_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"twilio_message_sid" text,
	"failure_reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient_profiles" ADD COLUMN "messaging_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "patient_profiles" ADD COLUMN "messaging_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "patient_profiles" ADD COLUMN "messaging_opted_out_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "patient_profiles" ADD COLUMN "preferred_reminder_channel" text DEFAULT 'sms' NOT NULL;--> statement-breakpoint
ALTER TABLE "appointment_reminders" ADD CONSTRAINT "appointment_reminders_tenant_id_tenant_registry_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant_registry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_reminders" ADD CONSTRAINT "appointment_reminders_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_reminders" ADD CONSTRAINT "appointment_reminders_patient_id_patient_profiles_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_reminders_due_idx" ON "appointment_reminders" USING btree ("tenant_id","status","scheduled_at");--> statement-breakpoint
CREATE INDEX "appointment_reminders_appointment_idx" ON "appointment_reminders" USING btree ("tenant_id","appointment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_reminders_dedup_idx" ON "appointment_reminders" USING btree ("tenant_id","appointment_id","channel","offset_hours");