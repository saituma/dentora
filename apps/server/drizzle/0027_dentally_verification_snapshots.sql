CREATE TABLE IF NOT EXISTS dentally_verification_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_run_id uuid NOT NULL REFERENCES dentally_verification_runs(id),
  verification_type text NOT NULL,
  request_summary jsonb NOT NULL DEFAULT '{}',
  response_summary jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL,
  duration_ms integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dentally_verification_snapshots_run_type_idx
  ON dentally_verification_snapshots (
    verification_run_id,
    verification_type,
    created_at
  );

ALTER TABLE dentally_verification_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE dentally_verification_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dentally_verification_snapshots_tenant_isolation
  ON dentally_verification_snapshots;
CREATE POLICY dentally_verification_snapshots_tenant_isolation
  ON dentally_verification_snapshots
  FOR ALL
  TO PUBLIC
  USING (
    EXISTS (
      SELECT 1
      FROM dentally_verification_runs runs
      WHERE runs.id = verification_run_id
        AND runs.tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM dentally_verification_runs runs
      WHERE runs.id = verification_run_id
        AND runs.tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    )
  );
