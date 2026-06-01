-- Tenant RLS backstop (fail-open), guarded for schema drift.
--
-- ENABLE + FORCE row-level security with a fail-open tenant_isolation policy on
-- every tenant-scoped table THAT EXISTS in this database. Tables absent in a given
-- environment (e.g. prod is missing clinic_history_files despite the migration
-- journal recording 0023) are skipped via to_regclass rather than failing the
-- whole migration.
--
-- FAIL-OPEN: a row is allowed when app.current_tenant_id is unset (identical to no
-- RLS); the tenant match is only enforced when a context is set. Purely additive —
-- never an outage. RLS only becomes ACTIVE once the app connects as a non-superuser
-- role with FF_DATABASE_RLS on; until then it is inert.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'appointment_holds',
    'appointment_reminders',
    'appointments',
    'audit_log',
    'booking_rules',
    'calendar_phi_remediation_runs',
    'call_cost_line_items',
    'call_costs',
    'call_events',
    'call_sessions',
    'call_transcripts',
    'clinic_history_files',
    'clinic_profile',
    'dentally_verification_runs',
    'deposits',
    'external_entity_mappings',
    'faq_library',
    'integrations',
    'media_stream_health_events',
    'patient_profiles',
    'pilot_preflight_status',
    'pms_webhook_events',
    'policies',
    'services',
    'staff_review_items',
    'tenant_active_config',
    'tenant_api_keys',
    'tenant_config_versions',
    'tenant_scheduling_config',
    'tenant_users',
    'twilio_numbers',
    'voice_profile'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO PUBLIC USING (nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid IS NULL OR tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid) WITH CHECK (nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid IS NULL OR tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid)',
      t || '_tenant_isolation',
      t
    );
  END LOOP;
END $$;
