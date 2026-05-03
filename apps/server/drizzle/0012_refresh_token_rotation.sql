-- Add columns for refresh token rotation with replay detection.
-- previous_refresh_token stores the last-rotated token so we can detect replay attacks.
-- rotated_at tracks when the rotation occurred.

ALTER TABLE "sessions" ADD COLUMN "previous_refresh_token" text;
ALTER TABLE "sessions" ADD COLUMN "rotated_at" timestamptz;
