CREATE TABLE IF NOT EXISTS dentally_verification_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant_registry(id),
  integration_id uuid NOT NULL,
  verification_type text NOT NULL,
  status text NOT NULL,
  request_metadata jsonb NOT NULL DEFAULT '{}',
  response_metadata jsonb NOT NULL DEFAULT '{}',
  duration_ms integer NOT NULL,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dentally_verification_runs_integration_tenant_fk
    FOREIGN KEY (tenant_id, integration_id)
    REFERENCES integrations (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS dentally_verification_runs_tenant_integration_type_idx
  ON dentally_verification_runs (
    tenant_id,
    integration_id,
    verification_type,
    created_at
  );

ALTER TABLE dentally_verification_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dentally_verification_runs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dentally_verification_runs_tenant_isolation
  ON dentally_verification_runs;
CREATE POLICY dentally_verification_runs_tenant_isolation
  ON dentally_verification_runs
  FOR ALL
  TO PUBLIC
  USING (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );
