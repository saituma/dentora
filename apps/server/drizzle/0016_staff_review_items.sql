CREATE TYPE staff_review_item_type AS ENUM (
  'booking_failure',
  'reconciliation_failed',
  'reconciliation_retry_scheduled',
  'cancellation_requested',
  'reschedule_requested',
  'readiness_failure',
  'legacy_calendar_phi_detected',
  'media_stream_failure',
  'ai_tool_safety_block'
);

CREATE TYPE staff_review_severity AS ENUM (
  'low',
  'medium',
  'high',
  'critical'
);

CREATE TYPE staff_review_status AS ENUM (
  'open',
  'in_review',
  'resolved',
  'ignored'
);

CREATE TYPE staff_review_source AS ENUM (
  'ai_tool',
  'appointment_reconciliation',
  'onboarding_readiness',
  'calendar_phi_scanner',
  'media_stream',
  'system'
);

CREATE TABLE staff_review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant_registry(id),
  type staff_review_item_type NOT NULL,
  severity staff_review_severity NOT NULL DEFAULT 'medium',
  status staff_review_status NOT NULL DEFAULT 'open',
  source staff_review_source NOT NULL,
  related_appointment_id uuid REFERENCES appointments(id),
  related_call_session_id uuid REFERENCES call_sessions(id),
  related_patient_id uuid REFERENCES patient_profiles(id),
  related_external_event_ref text,
  reason_code text NOT NULL,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text,
  assigned_to_user_id uuid REFERENCES users(id),
  resolved_by_user_id uuid REFERENCES users(id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX staff_review_items_tenant_status_created_idx
  ON staff_review_items(tenant_id, status, created_at);

CREATE INDEX staff_review_items_tenant_type_created_idx
  ON staff_review_items(tenant_id, type, created_at);

CREATE UNIQUE INDEX staff_review_items_tenant_dedupe_status_idx
  ON staff_review_items(tenant_id, dedupe_key, status);

ALTER TABLE staff_review_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_review_items FORCE ROW LEVEL SECURITY;

CREATE POLICY staff_review_items_tenant_isolation ON staff_review_items
  FOR ALL
  TO PUBLIC
  USING (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );
