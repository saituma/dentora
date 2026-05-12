import { lt, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions, passwordResetTokens, callTranscripts, auditLog } from '../db/schema.js';
import { logger } from './logger.js';

/**
 * Data retention policies — UK GDPR / DPA 2018 compliant defaults.
 * ICO guidance: retain only as long as necessary for the original purpose.
 */
export const retentionPolicies = {
  callTranscripts: { days: 730, description: 'Call transcripts (2 years)' },
  auditLogs: { days: 2555, description: 'Audit logs (7 years — legal obligation)' },
  expiredSessions: { days: 7, description: 'Expired sessions (7 days after expiry)' },
  passwordResetTokens: { days: 1, description: 'Password reset tokens (1 day after expiry)' },
} as const;

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

export async function runDataRetention(): Promise<{
  deletedSessions: number;
  deletedPasswordResetTokens: number;
  deletedCallTranscripts: number;
  deletedAuditLogs: number;
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
  log.info(
    { count: deletedSessions, cutoff: sessionCutoff.toISOString() },
    'Deleted expired sessions',
  );

  // 2. Delete expired password reset tokens
  const tokenCutoff = daysAgo(retentionPolicies.passwordResetTokens.days);
  const deletedTokensResult = await db
    .delete(passwordResetTokens)
    .where(lt(passwordResetTokens.expiresAt, tokenCutoff))
    .returning({ id: passwordResetTokens.id });
  const deletedPasswordResetTokens = deletedTokensResult.length;
  log.info(
    { count: deletedPasswordResetTokens, cutoff: tokenCutoff.toISOString() },
    'Deleted expired password reset tokens',
  );

  // 3. Delete call transcripts older than 2 years
  const transcriptCutoff = daysAgo(retentionPolicies.callTranscripts.days);
  const [transcriptCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(callTranscripts)
    .where(lt(callTranscripts.createdAt, transcriptCutoff));
  const deletedCallTranscripts = transcriptCount?.count ?? 0;
  if (deletedCallTranscripts > 0) {
    await db.delete(callTranscripts).where(lt(callTranscripts.createdAt, transcriptCutoff));
    log.info(
      { count: deletedCallTranscripts, cutoff: transcriptCutoff.toISOString() },
      'Deleted old call transcripts',
    );
  }

  // 4. Delete audit logs older than 7 years
  const auditCutoff = daysAgo(retentionPolicies.auditLogs.days);
  const [auditCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(lt(auditLog.createdAt, auditCutoff));
  const deletedAuditLogs = auditCount?.count ?? 0;
  if (deletedAuditLogs > 0) {
    await db.delete(auditLog).where(lt(auditLog.createdAt, auditCutoff));
    log.info(
      { count: deletedAuditLogs, cutoff: auditCutoff.toISOString() },
      'Deleted old audit logs',
    );
  }

  log.info(
    { deletedSessions, deletedPasswordResetTokens, deletedCallTranscripts, deletedAuditLogs },
    'Data retention cleanup complete',
  );

  return { deletedSessions, deletedPasswordResetTokens, deletedCallTranscripts, deletedAuditLogs };
}
