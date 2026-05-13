CREATE TYPE "public"."calendar_phi_remediation_run_status" AS ENUM('dry_run_completed', 'scrub_running', 'scrub_completed', 'scrub_failed');
CREATE TYPE "public"."calendar_phi_remediation_run_mode" AS ENUM('dry_run', 'confirmed_scrub');

CREATE TABLE "calendar_phi_remediation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" "calendar_phi_remediation_run_status" NOT NULL,
	"mode" "calendar_phi_remediation_run_mode" NOT NULL,
	"total_events_scanned" integer DEFAULT 0 NOT NULL,
	"risky_events_count" integer DEFAULT 0 NOT NULL,
	"scrubbed_events_count" integer,
	"failed_scrub_count" integer,
	"risk_codes_summary" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failure_code" text,
	"failure_reason_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_phi_remediation_runs_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant_registry"("id") ON DELETE no action ON UPDATE no action,
	CONSTRAINT "calendar_phi_remediation_runs_approved_by_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
);

CREATE INDEX "calendar_phi_remediation_runs_tenant_idx" ON "calendar_phi_remediation_runs" USING btree ("tenant_id","created_at");
CREATE INDEX "calendar_phi_remediation_runs_tenant_status_idx" ON "calendar_phi_remediation_runs" USING btree ("tenant_id","status","created_at");
