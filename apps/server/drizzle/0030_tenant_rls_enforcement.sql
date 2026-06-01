-- Tenant RLS backstop (fail-open). ENABLE + FORCE row-level security with a
-- tenant_isolation policy on every tenant-scoped table. The policy is FAIL-OPEN:
-- when app.current_tenant_id is unset it allows the row (identical to no RLS), and
-- only enforces the tenant match when a context is set. This is a purely additive
-- backstop — it blocks cross-tenant access on the normal request path (where the
-- pool hook sets the context) and can never cause an outage on a context-less path.
--
-- Safe to deploy in any order, flag on or off. RLS only becomes ACTIVE once the app
-- connects as a non-superuser role (owner/superuser bypass RLS); until then it is
-- inert, never harmful.

ALTER TABLE appointment_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_holds FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON appointment_holds;
DROP POLICY IF EXISTS appointment_holds_tenant_isolation ON appointment_holds;
CREATE POLICY appointment_holds_tenant_isolation ON appointment_holds
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE appointment_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_reminders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON appointment_reminders;
DROP POLICY IF EXISTS appointment_reminders_tenant_isolation ON appointment_reminders;
CREATE POLICY appointment_reminders_tenant_isolation ON appointment_reminders
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON appointments;
DROP POLICY IF EXISTS appointments_tenant_isolation ON appointments;
CREATE POLICY appointments_tenant_isolation ON appointments
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON audit_log;
DROP POLICY IF EXISTS audit_log_tenant_isolation ON audit_log;
CREATE POLICY audit_log_tenant_isolation ON audit_log
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE booking_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON booking_rules;
DROP POLICY IF EXISTS booking_rules_tenant_isolation ON booking_rules;
CREATE POLICY booking_rules_tenant_isolation ON booking_rules
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE calendar_phi_remediation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_phi_remediation_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON calendar_phi_remediation_runs;
DROP POLICY IF EXISTS calendar_phi_remediation_runs_tenant_isolation ON calendar_phi_remediation_runs;
CREATE POLICY calendar_phi_remediation_runs_tenant_isolation ON calendar_phi_remediation_runs
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE call_cost_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_cost_line_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON call_cost_line_items;
DROP POLICY IF EXISTS call_cost_line_items_tenant_isolation ON call_cost_line_items;
CREATE POLICY call_cost_line_items_tenant_isolation ON call_cost_line_items
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE call_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_costs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON call_costs;
DROP POLICY IF EXISTS call_costs_tenant_isolation ON call_costs;
CREATE POLICY call_costs_tenant_isolation ON call_costs
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE call_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON call_events;
DROP POLICY IF EXISTS call_events_tenant_isolation ON call_events;
CREATE POLICY call_events_tenant_isolation ON call_events
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON call_sessions;
DROP POLICY IF EXISTS call_sessions_tenant_isolation ON call_sessions;
CREATE POLICY call_sessions_tenant_isolation ON call_sessions
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE call_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_transcripts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON call_transcripts;
DROP POLICY IF EXISTS call_transcripts_tenant_isolation ON call_transcripts;
CREATE POLICY call_transcripts_tenant_isolation ON call_transcripts
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE clinic_history_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_history_files FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON clinic_history_files;
DROP POLICY IF EXISTS clinic_history_files_tenant_isolation ON clinic_history_files;
CREATE POLICY clinic_history_files_tenant_isolation ON clinic_history_files
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE clinic_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_profile FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON clinic_profile;
DROP POLICY IF EXISTS clinic_profile_tenant_isolation ON clinic_profile;
CREATE POLICY clinic_profile_tenant_isolation ON clinic_profile
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE dentally_verification_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dentally_verification_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dentally_verification_runs;
DROP POLICY IF EXISTS dentally_verification_runs_tenant_isolation ON dentally_verification_runs;
CREATE POLICY dentally_verification_runs_tenant_isolation ON dentally_verification_runs
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposits FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON deposits;
DROP POLICY IF EXISTS deposits_tenant_isolation ON deposits;
CREATE POLICY deposits_tenant_isolation ON deposits
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE external_entity_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_entity_mappings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON external_entity_mappings;
DROP POLICY IF EXISTS external_entity_mappings_tenant_isolation ON external_entity_mappings;
CREATE POLICY external_entity_mappings_tenant_isolation ON external_entity_mappings
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE faq_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq_library FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON faq_library;
DROP POLICY IF EXISTS faq_library_tenant_isolation ON faq_library;
CREATE POLICY faq_library_tenant_isolation ON faq_library
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON integrations;
DROP POLICY IF EXISTS integrations_tenant_isolation ON integrations;
CREATE POLICY integrations_tenant_isolation ON integrations
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE media_stream_health_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_stream_health_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON media_stream_health_events;
DROP POLICY IF EXISTS media_stream_health_events_tenant_isolation ON media_stream_health_events;
CREATE POLICY media_stream_health_events_tenant_isolation ON media_stream_health_events
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE patient_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON patient_profiles;
DROP POLICY IF EXISTS patient_profiles_tenant_isolation ON patient_profiles;
CREATE POLICY patient_profiles_tenant_isolation ON patient_profiles
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE pilot_preflight_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_preflight_status FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON pilot_preflight_status;
DROP POLICY IF EXISTS pilot_preflight_status_tenant_isolation ON pilot_preflight_status;
CREATE POLICY pilot_preflight_status_tenant_isolation ON pilot_preflight_status
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE pms_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_webhook_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON pms_webhook_events;
DROP POLICY IF EXISTS pms_webhook_events_tenant_isolation ON pms_webhook_events;
CREATE POLICY pms_webhook_events_tenant_isolation ON pms_webhook_events
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON policies;
DROP POLICY IF EXISTS policies_tenant_isolation ON policies;
CREATE POLICY policies_tenant_isolation ON policies
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE services FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON services;
DROP POLICY IF EXISTS services_tenant_isolation ON services;
CREATE POLICY services_tenant_isolation ON services
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE staff_review_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_review_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON staff_review_items;
DROP POLICY IF EXISTS staff_review_items_tenant_isolation ON staff_review_items;
CREATE POLICY staff_review_items_tenant_isolation ON staff_review_items
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE tenant_active_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_active_config FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenant_active_config;
DROP POLICY IF EXISTS tenant_active_config_tenant_isolation ON tenant_active_config;
CREATE POLICY tenant_active_config_tenant_isolation ON tenant_active_config
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE tenant_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_api_keys FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenant_api_keys;
DROP POLICY IF EXISTS tenant_api_keys_tenant_isolation ON tenant_api_keys;
CREATE POLICY tenant_api_keys_tenant_isolation ON tenant_api_keys
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE tenant_config_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_config_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenant_config_versions;
DROP POLICY IF EXISTS tenant_config_versions_tenant_isolation ON tenant_config_versions;
CREATE POLICY tenant_config_versions_tenant_isolation ON tenant_config_versions
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE tenant_scheduling_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_scheduling_config FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenant_scheduling_config;
DROP POLICY IF EXISTS tenant_scheduling_config_tenant_isolation ON tenant_scheduling_config;
CREATE POLICY tenant_scheduling_config_tenant_isolation ON tenant_scheduling_config
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenant_users;
DROP POLICY IF EXISTS tenant_users_tenant_isolation ON tenant_users;
CREATE POLICY tenant_users_tenant_isolation ON tenant_users
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE twilio_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE twilio_numbers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON twilio_numbers;
DROP POLICY IF EXISTS twilio_numbers_tenant_isolation ON twilio_numbers;
CREATE POLICY twilio_numbers_tenant_isolation ON twilio_numbers
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE voice_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_profile FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON voice_profile;
DROP POLICY IF EXISTS voice_profile_tenant_isolation ON voice_profile;
CREATE POLICY voice_profile_tenant_isolation ON voice_profile
  FOR ALL
  TO PUBLIC
  USING (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.current_tenant_id', true), '')::uuid IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

