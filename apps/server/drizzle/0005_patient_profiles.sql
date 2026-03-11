CREATE TABLE "patient_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "full_name" text NOT NULL,
  "date_of_birth" text,
  "phone_number" text NOT NULL,
  "last_visit_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_tenant_id_tenant_registry_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant_registry"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX "patient_profiles_tenant_phone_idx" ON "patient_profiles" USING btree ("tenant_id","phone_number");
CREATE UNIQUE INDEX "patient_profiles_tenant_phone_dob_idx" ON "patient_profiles" USING btree ("tenant_id","phone_number","date_of_birth");
