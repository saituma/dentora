-- Phase 3: PHI encryption columns + MFA fields
-- patient_profiles: hash column for deterministic phone lookups after encryption
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS phone_number_hash TEXT;

-- Index on hash for fast tenant-scoped phone lookups
CREATE INDEX IF NOT EXISTS patient_profiles_tenant_phone_hash_idx
  ON patient_profiles (tenant_id, phone_number_hash)
  WHERE phone_number_hash IS NOT NULL;

-- Unique constraint using hash (partial — only rows with hash set, i.e. post-backfill)
CREATE UNIQUE INDEX IF NOT EXISTS patient_profiles_tenant_phone_hash_dob_idx
  ON patient_profiles (tenant_id, phone_number_hash, date_of_birth)
  WHERE phone_number_hash IS NOT NULL;

-- call_sessions: hash column for deterministic caller lookups after encryption
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS caller_number_hash TEXT;

CREATE INDEX IF NOT EXISTS call_sessions_caller_hash_idx
  ON call_sessions (tenant_id, caller_number_hash)
  WHERE caller_number_hash IS NOT NULL;

-- MFA fields on users
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_recovery_codes TEXT[] NOT NULL DEFAULT '{}';
