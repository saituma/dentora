CREATE TABLE "operational_health" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"component" text NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"last_started_at" timestamp with time zone,
	"last_completed_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_name" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operational_health_component_unique" UNIQUE("component")
);

CREATE TABLE "media_stream_health_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"event_type" text NOT NULL,
	"reason_code" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_stream_health_events_tenant_id_tenant_registry_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant_registry"("id") ON DELETE no action ON UPDATE no action
);

CREATE INDEX "operational_health_component_idx" ON "operational_health" USING btree ("component");
CREATE INDEX "media_stream_health_events_tenant_time_idx" ON "media_stream_health_events" USING btree ("tenant_id","occurred_at");
CREATE INDEX "media_stream_health_events_type_time_idx" ON "media_stream_health_events" USING btree ("event_type","occurred_at");
