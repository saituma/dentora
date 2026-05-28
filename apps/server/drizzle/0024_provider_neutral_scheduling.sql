ALTER TYPE integration_type ADD VALUE IF NOT EXISTS 'scheduling';

DO $$
BEGIN
  CREATE TYPE scheduling_provider AS ENUM (
    'google_calendar',
    'dentally',
    'soe_exact',
    'cs_r4_plus'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE scheduling_source_of_truth AS ENUM (
    'google_calendar',
    'pms',
    'local_ledger'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE google_sync_mode AS ENUM (
    'disabled',
    'mirror_busy',
    'mirror_full',
    'fallback_only'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE external_entity_type AS ENUM (
    'appointment',
    'patient',
    'clinician',
    'room',
    'service',
    'treatment_type'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS integrations_tenant_id_idx
  ON integrations (tenant_id, id);

CREATE INDEX IF NOT EXISTS integrations_tenant_type_provider_idx
  ON integrations (tenant_id, integration_type, provider);

CREATE TABLE IF NOT EXISTS tenant_scheduling_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant_registry(id),
  primary_provider scheduling_provider NOT NULL,
  primary_integration_id uuid NOT NULL,
  fallback_provider scheduling_provider,
  fallback_integration_id uuid,
  source_of_truth scheduling_source_of_truth NOT NULL DEFAULT 'local_ledger',
  google_sync_mode google_sync_mode NOT NULL DEFAULT 'fallback_only',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_scheduling_config_primary_integration_tenant_fk
    FOREIGN KEY (tenant_id, primary_integration_id)
    REFERENCES integrations (tenant_id, id),
  CONSTRAINT tenant_scheduling_config_fallback_integration_tenant_fk
    FOREIGN KEY (tenant_id, fallback_integration_id)
    REFERENCES integrations (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_scheduling_config_tenant_idx
  ON tenant_scheduling_config (tenant_id);

CREATE INDEX IF NOT EXISTS tenant_scheduling_config_primary_integration_idx
  ON tenant_scheduling_config (primary_integration_id);

CREATE INDEX IF NOT EXISTS tenant_scheduling_config_fallback_integration_idx
  ON tenant_scheduling_config (fallback_integration_id);

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS external_provider scheduling_provider,
  ADD COLUMN IF NOT EXISTS external_appointment_id text,
  ADD COLUMN IF NOT EXISTS external_patient_id text,
  ADD COLUMN IF NOT EXISTS external_clinician_id text,
  ADD COLUMN IF NOT EXISTS external_room_id text;

CREATE INDEX IF NOT EXISTS appointments_tenant_external_appointment_idx
  ON appointments (tenant_id, external_provider, external_appointment_id);

CREATE TABLE IF NOT EXISTS external_entity_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant_registry(id),
  local_entity_type external_entity_type NOT NULL,
  local_entity_id text NOT NULL,
  external_provider scheduling_provider NOT NULL,
  external_entity_type external_entity_type NOT NULL,
  external_entity_id text NOT NULL,
  integration_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_entity_mappings_integration_tenant_fk
    FOREIGN KEY (tenant_id, integration_id)
    REFERENCES integrations (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS external_entity_mappings_external_unique_idx
  ON external_entity_mappings (
    tenant_id,
    integration_id,
    external_provider,
    external_entity_type,
    external_entity_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS external_entity_mappings_local_external_unique_idx
  ON external_entity_mappings (
    tenant_id,
    local_entity_type,
    local_entity_id,
    integration_id,
    external_provider,
    external_entity_type
  );

CREATE INDEX IF NOT EXISTS external_entity_mappings_tenant_local_idx
  ON external_entity_mappings (tenant_id, local_entity_type, local_entity_id);

ALTER TABLE tenant_scheduling_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_scheduling_config FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_scheduling_config_tenant_isolation ON tenant_scheduling_config;
CREATE POLICY tenant_scheduling_config_tenant_isolation ON tenant_scheduling_config
  FOR ALL
  TO PUBLIC
  USING (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );

ALTER TABLE external_entity_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_entity_mappings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS external_entity_mappings_tenant_isolation ON external_entity_mappings;
CREATE POLICY external_entity_mappings_tenant_isolation ON external_entity_mappings
  FOR ALL
  TO PUBLIC
  USING (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );
