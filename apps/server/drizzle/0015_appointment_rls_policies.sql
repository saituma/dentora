ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;

ALTER TABLE appointment_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_holds FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointments_tenant_isolation ON appointments;
CREATE POLICY appointments_tenant_isolation ON appointments
  FOR ALL
  TO PUBLIC
  USING (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );

DROP POLICY IF EXISTS appointment_holds_tenant_isolation ON appointment_holds;
CREATE POLICY appointment_holds_tenant_isolation ON appointment_holds
  FOR ALL
  TO PUBLIC
  USING (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );
