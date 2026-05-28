ALTER TYPE "public"."twilio_number_status" ADD VALUE IF NOT EXISTS 'available' BEFORE 'active';--> statement-breakpoint
ALTER TABLE "twilio_numbers" ALTER COLUMN "tenant_id" DROP NOT NULL;
