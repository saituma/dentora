CREATE UNIQUE INDEX IF NOT EXISTS "twilio_numbers_tenant_active_unique_idx"
ON "twilio_numbers" USING btree ("tenant_id")
WHERE "status" = 'active';
