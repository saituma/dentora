import { lt, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions, passwordResetTokens, callSessions, callTranscripts, auditLog } from '../db/schema.js';
import { logger } from './logger.js';

/**
 * Data retention policies (in days).
 * These define how long each data type is kept after creation or expiry.
 */
export const retentionPolicies = {
  callRecordings: { days: 90, description: 'Call recordings' },
  callTranscripts: { days: 180, description: 'Call transcripts' },
  auditLogs: { days: 365, description: 'Audit logs' },
  expiredSessions: { days: 7, description: 'Expired sessions (after expiry)' },
  passwordResetTokens: { days: 1, description: 'Password reset tokens (after expiry)' },
} as const;

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

export async function runDataRetention(): Promise<{
  deletedSessions: number;
  deletedPasswordResetTokens: number;
  dryRun: {
    callRecordingsEligible: number;
    callTranscriptsEligible: number;
    auditLogsEligible: number;
  };
}> {
  const log = logger.child({ module: 'data-retention' });

  log.info('Starting data retention cleanup');

  // 1. Delete expired sessions (expiresAt < now - 7 days)
  const sessionCutoff = daysAgo(retentionPolicies.expiredSessions.days);
  const deletedSessionsResult = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, sessionCutoff))
    .returning({ id: sessions.id });
  const deletedSessions = deletedSessionsResult.length;
  log.info({ count: deletedSessions, cutoff: sessionCutoff.toISOString() }, 'Deleted expired sessions');

  // 2. Delete expired password reset tokens (expiresAt < now - 1 day)
  const tokenCutoff = daysAgo(retentionPolicies.passwordResetTokens.days);
  const deletedTokensResult = await db
    .delete(passwordResetTokens)
    .where(lt(passwordResetTokens.expiresAt, tokenCutoff))
    .returning({ id: passwordResetTokens.id });
  const deletedPasswordResetTokens = deletedTokensResult.length;
  log.info({ count: deletedPasswordResetTokens, cutoff: tokenCutoff.toISOString() }, 'Deleted expired password reset tokens');

  // 3. Dry-run: count call recordings eligible for deletion (call sessions older than 90 days)
  // Recordings are stored in R2, so we only log what would be affected
  const recordingCutoff = daysAgo(retentionPolicies.callRecordings.days);
  const [recordingCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(callSessions)
    .where(lt(callSessions.createdAt, recordingCutoff));
  const callRecordingsEligible = recordingCount?.count ?? 0;
  log.info(
    { count: callRecordingsEligible, cutoff: recordingCutoff.toISOString() },
    'DRY RUN: Call recordings eligible for deletion (requires R2 cleanup)',
  );

  // 4. Dry-run: count call transcripts eligible for deletion (older than 180 days)
  const transcriptCutoff = daysAgo(retentionPolicies.callTranscripts.days);
  const [transcriptCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(callTranscripts)
    .where(lt(callTranscripts.createdAt, transcriptCutoff));
  const callTranscriptsEligible = transcriptCount?.count ?? 0;
  log.info(
    { count: callTranscriptsEligible, cutoff: transcriptCutoff.toISOString() },
    'DRY RUN: Call transcripts eligible for deletion (requires R2 cleanup)',
  );

  // 5. Dry-run: count audit logs eligible for deletion (older than 365 days)
  const auditCutoff = daysAgo(retentionPolicies.auditLogs.days);
  const [auditCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(lt(auditLog.createdAt, auditCutoff));
  const auditLogsEligible = auditCount?.count ?? 0;
  log.info(
    { count: auditLogsEligible, cutoff: auditCutoff.toISOString() },
    'DRY RUN: Audit logs eligible for deletion',
  );

  log.info('Data retention cleanup complete');

  return {
    deletedSessions,
    deletedPasswordResetTokens,
    dryRun: {
      callRecordingsEligible,
      callTranscriptsEligible,
      auditLogsEligible,
    },
  };
}
