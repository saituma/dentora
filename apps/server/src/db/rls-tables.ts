/**
 * Canonical list of tenant-scoped tables (every table with a tenant_id column),
 * used by the Phase 1 migration intent and the verify-tenant-isolation harness.
 *
 * RLS policy posture is FAIL-OPEN: when `app.current_tenant_id` is unset the
 * policy allows the row (behaving exactly like no RLS), and only enforces the
 * tenant match when a context IS set. This makes RLS a pure additive backstop —
 * it can block cross-tenant access on the normal request path (where the pool
 * hook always sets the context) but can never cause an outage on a context-less
 * path (login, call routing, an unwrapped worker job, a missed code path). Those
 * remain protected by application-level eq(tenantId) as before.
 */
export const RLS_TENANT_TABLES = [
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
  'voice_profile',
] as const;
