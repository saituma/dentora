CREATE TABLE IF NOT EXISTS pms_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant_registry(id),
  provider scheduling_provider NOT NULL,
  integration_id uuid NOT NULL,
  external_event_id text NOT NULL,
  event_type text NOT NULL,
  payload_hash text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'received',
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_webhook_events_integration_tenant_fk
    FOREIGN KEY (tenant_id, integration_id)
    REFERENCES integrations (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS pms_webhook_events_external_unique_idx
  ON pms_webhook_events (tenant_id, provider, integration_id, external_event_id);

CREATE INDEX IF NOT EXISTS pms_webhook_events_tenant_type_received_idx
  ON pms_webhook_events (tenant_id, event_type, received_at);

ALTER TABLE pms_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_webhook_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pms_webhook_events_tenant_isolation ON pms_webhook_events;
CREATE POLICY pms_webhook_events_tenant_isolation ON pms_webhook_events
  FOR ALL
  TO PUBLIC
  USING (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );
