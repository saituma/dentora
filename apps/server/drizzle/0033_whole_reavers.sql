CREATE TABLE "demo_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone_e164" text NOT NULL,
	"phone_country" text NOT NULL,
	"message" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "demo_requests_created_at_idx" ON "demo_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "demo_requests_email_idx" ON "demo_requests" USING btree ("email");