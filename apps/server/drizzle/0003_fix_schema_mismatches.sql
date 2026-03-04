-- Migration 0003: Fix schema mismatches between DB tables and service/client code
-- Adds missing columns, fixes enums, relaxes NOT NULL constraints for CRUD API

-- ============================================================
-- 1. Fix voice_tone enum (add 'formal' and 'casual')
-- ============================================================
ALTER TYPE voice_tone ADD VALUE IF NOT EXISTS 'formal';
ALTER TYPE voice_tone ADD VALUE IF NOT EXISTS 'casual';

-- ============================================================
-- 2. Voice profile: add missing columns for dashboard CRUD
-- ============================================================
ALTER TABLE voice_profile ADD COLUMN IF NOT EXISTS greeting_message text;
ALTER TABLE voice_profile ADD COLUMN IF NOT EXISTS after_hours_message text;
ALTER TABLE voice_profile ADD COLUMN IF NOT EXISTS language text DEFAULT 'en';
ALTER TABLE voice_profile ADD COLUMN IF NOT EXISTS speech_speed numeric(3, 2);
ALTER TABLE voice_profile ALTER COLUMN voice_id DROP NOT NULL;
ALTER TABLE voice_profile ALTER COLUMN speaking_speed DROP NOT NULL;
ALTER TABLE voice_profile ALTER COLUMN tone SET DEFAULT 'professional';
ALTER TABLE voice_profile ALTER COLUMN config_version DROP NOT NULL;

-- ============================================================
-- 3. Clinic profile: add columns used by settings page
-- ============================================================
ALTER TABLE clinic_profile ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE clinic_profile ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE clinic_profile ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE clinic_profile ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE clinic_profile ADD COLUMN IF NOT EXISTS logo text;
ALTER TABLE clinic_profile ADD COLUMN IF NOT EXISTS branding_colors jsonb;
ALTER TABLE clinic_profile ADD COLUMN IF NOT EXISTS business_hours jsonb;
ALTER TABLE clinic_profile ADD COLUMN IF NOT EXISTS specialties jsonb;
ALTER TABLE clinic_profile ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE clinic_profile ALTER COLUMN legal_entity_name DROP NOT NULL;
ALTER TABLE clinic_profile ALTER COLUMN primary_phone DROP NOT NULL;
ALTER TABLE clinic_profile ALTER COLUMN support_email DROP NOT NULL;
ALTER TABLE clinic_profile ALTER COLUMN locations DROP NOT NULL;
ALTER TABLE clinic_profile ALTER COLUMN config_version DROP NOT NULL;

-- ============================================================
-- 4. Services: add columns, relax constraints for dashboard CRUD
-- ============================================================
ALTER TABLE services ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE services ADD COLUMN IF NOT EXISTS price numeric(10, 2);
ALTER TABLE services ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
ALTER TABLE services ALTER COLUMN service_code DROP NOT NULL;
ALTER TABLE services ALTER COLUMN service_category DROP NOT NULL;
ALTER TABLE services ALTER COLUMN duration_minutes DROP NOT NULL;
ALTER TABLE services ALTER COLUMN config_version DROP NOT NULL;

-- ============================================================
-- 5. Booking rules: add columns, relax constraints
-- ============================================================
ALTER TABLE booking_rules ADD COLUMN IF NOT EXISTS default_appointment_duration_minutes integer DEFAULT 30;
ALTER TABLE booking_rules ADD COLUMN IF NOT EXISTS buffer_between_appointments_minutes integer DEFAULT 0;
ALTER TABLE booking_rules ADD COLUMN IF NOT EXISTS operating_schedule jsonb;
ALTER TABLE booking_rules ALTER COLUMN config_version DROP NOT NULL;
ALTER TABLE booking_rules ALTER COLUMN min_notice_hours DROP NOT NULL;
ALTER TABLE booking_rules ALTER COLUMN max_future_days DROP NOT NULL;
ALTER TABLE booking_rules ALTER COLUMN cancellation_cutoff_hours DROP NOT NULL;
ALTER TABLE booking_rules ALTER COLUMN double_booking_policy DROP NOT NULL;
ALTER TABLE booking_rules ALTER COLUMN emergency_slot_policy DROP NOT NULL;
ALTER TABLE booking_rules ALTER COLUMN after_hours_policy DROP NOT NULL;

-- ============================================================
-- 6. Policies: add simple policyType/content, relax constraints
-- ============================================================
ALTER TABLE policies ADD COLUMN IF NOT EXISTS policy_type text;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE policies ALTER COLUMN config_version DROP NOT NULL;
ALTER TABLE policies ALTER COLUMN escalation_conditions DROP NOT NULL;
ALTER TABLE policies ALTER COLUMN emergency_disclaimer DROP NOT NULL;
ALTER TABLE policies ALTER COLUMN sensitive_topics DROP NOT NULL;
ALTER TABLE policies ALTER COLUMN human_callback_sla_minutes DROP NOT NULL;
ALTER TABLE policies ALTER COLUMN compliance_flags DROP NOT NULL;

-- ============================================================
-- 7. FAQ library: add question/answer columns, relax constraints
-- ============================================================
ALTER TABLE faq_library ADD COLUMN IF NOT EXISTS question text;
ALTER TABLE faq_library ADD COLUMN IF NOT EXISTS answer text;
ALTER TABLE faq_library ADD COLUMN IF NOT EXISTS priority integer DEFAULT 0;
ALTER TABLE faq_library ALTER COLUMN faq_key DROP NOT NULL;
ALTER TABLE faq_library ALTER COLUMN question_variants DROP NOT NULL;
ALTER TABLE faq_library ALTER COLUMN canonical_answer DROP NOT NULL;
ALTER TABLE faq_library ALTER COLUMN category DROP NOT NULL;
ALTER TABLE faq_library ALTER COLUMN config_version DROP NOT NULL;

-- ============================================================
-- 8. Call sessions: add columns used by call service & client
-- ============================================================
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone;
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS cost_estimate numeric(10, 6);
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS ai_provider text;
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS ai_model text;
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS clinic_number text;
ALTER TABLE call_sessions ALTER COLUMN twilio_call_sid DROP NOT NULL;

-- ============================================================
-- 9. Integrations: relax configVersion for dashboard CRUD
-- ============================================================
ALTER TABLE integrations ALTER COLUMN config_version DROP NOT NULL;
