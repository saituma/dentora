DO $$ BEGIN
 CREATE TYPE "public"."auth_identity_provider" AS ENUM('email', 'phone', 'google');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "auth_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "provider" "auth_identity_provider" NOT NULL,
  "provider_user_id" text NOT NULL,
  "verified" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "otp_challenges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "channel" "auth_identity_provider" NOT NULL,
  "target" text NOT NULL,
  "code_hash" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "auth_identities_provider_user_idx" ON "auth_identities" USING btree ("provider","provider_user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "auth_identities_user_provider_idx" ON "auth_identities" USING btree ("user_id","provider");
CREATE INDEX IF NOT EXISTS "otp_challenges_target_idx" ON "otp_challenges" USING btree ("channel","target","created_at");
