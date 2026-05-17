CREATE TABLE IF NOT EXISTS "clinic_history_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "original_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "storage_key" text NOT NULL,
  "uploaded_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  ALTER TABLE "clinic_history_files"
    ADD CONSTRAINT "clinic_history_files_tenant_id_tenant_registry_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant_registry"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  ALTER TABLE "clinic_history_files"
    ADD CONSTRAINT "clinic_history_files_uploaded_by_user_id_users_id_fk"
    FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

CREATE INDEX IF NOT EXISTS "clinic_history_files_tenant_idx"
  ON "clinic_history_files" USING btree ("tenant_id","created_at");

ALTER TABLE clinic_history_files ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY tenant_isolation ON clinic_history_files
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;
