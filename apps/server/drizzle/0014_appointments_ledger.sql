DO $$ BEGIN
  CREATE TYPE appointment_status AS ENUM ('held', 'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE appointment_hold_status AS ENUM ('active', 'converted', 'expired', 'released');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant_registry(id),
  patient_id UUID REFERENCES patient_profiles(id),
  service_id UUID REFERENCES services(id),
  staff_id TEXT,
  call_session_id UUID REFERENCES call_sessions(id),
  status appointment_status NOT NULL DEFAULT 'scheduled',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL,
  calendar_integration_id UUID REFERENCES integrations(id),
  external_calendar_event_id TEXT,
  idempotency_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS appointments_tenant_time_idx
  ON appointments (tenant_id, start_at, end_at);

CREATE INDEX IF NOT EXISTS appointments_tenant_status_time_idx
  ON appointments (tenant_id, status, start_at);

CREATE UNIQUE INDEX IF NOT EXISTS appointments_tenant_idempotency_idx
  ON appointments (tenant_id, idempotency_key);

CREATE INDEX IF NOT EXISTS appointments_tenant_external_event_idx
  ON appointments (tenant_id, external_calendar_event_id);

CREATE TABLE IF NOT EXISTS appointment_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant_registry(id),
  patient_id UUID REFERENCES patient_profiles(id),
  service_id UUID REFERENCES services(id),
  staff_id TEXT,
  call_session_id UUID REFERENCES call_sessions(id),
  status appointment_hold_status NOT NULL DEFAULT 'active',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL,
  calendar_integration_id UUID REFERENCES integrations(id),
  idempotency_key TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS appointment_holds_tenant_time_idx
  ON appointment_holds (tenant_id, start_at, end_at);

CREATE INDEX IF NOT EXISTS appointment_holds_tenant_status_expires_idx
  ON appointment_holds (tenant_id, status, expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS appointment_holds_tenant_idempotency_idx
  ON appointment_holds (tenant_id, idempotency_key);
