ALTER TABLE "clinic_profile" ADD COLUMN IF NOT EXISTS "staff_members" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_registry" ADD COLUMN IF NOT EXISTS "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "tenant_registry" ADD COLUMN IF NOT EXISTS "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "tenant_registry" ADD COLUMN IF NOT EXISTS "stripe_price_id" text;--> statement-breakpoint
ALTER TABLE "voice_profile" ADD COLUMN IF NOT EXISTS "voice_agent_id" text;--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_tenant_id_tenant_registry_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant_registry"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "patient_profiles_tenant_phone_idx" ON "patient_profiles" USING btree ("tenant_id","phone_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "patient_profiles_tenant_phone_dob_idx" ON "patient_profiles" USING btree ("tenant_id","phone_number","date_of_birth");
