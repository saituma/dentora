-- Add unique index on (tenant_id, phone_number_hash) to support ON CONFLICT upserts.
-- The prior index was non-unique, causing "no unique or exclusion constraint" errors
-- when upsertPatientProfile ran during appointment booking.
CREATE UNIQUE INDEX IF NOT EXISTS patient_profiles_tenant_phone_hash_unique
  ON patient_profiles (tenant_id, phone_number_hash)
  WHERE phone_number_hash IS NOT NULL;
