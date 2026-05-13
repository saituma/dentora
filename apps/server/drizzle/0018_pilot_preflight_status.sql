CREATE TABLE "pilot_preflight_status" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"latest_calendar_phi_scan_at" timestamp with time zone,
	"latest_calendar_phi_total_events" integer,
	"latest_calendar_phi_risky_events" integer,
	"last_preflight_checked_at" timestamp with time zone,
	"last_preflight_ready" boolean,
	"last_blocking_issue_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_warning_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pilot_preflight_status_tenant_id_tenant_registry_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant_registry"("id") ON DELETE no action ON UPDATE no action
);

CREATE INDEX "pilot_preflight_status_checked_idx" ON "pilot_preflight_status" USING btree ("tenant_id","last_preflight_checked_at");
