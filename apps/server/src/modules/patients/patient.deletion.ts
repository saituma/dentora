import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  patientProfiles,
  callSessions,
  callTranscripts,
  callEvents,
  callCosts,
  callCostLineItems,
} from '../../db/schema.js';
import { logger } from '../../lib/logger.js';
import { hashForSearch } from '../../lib/encrypted-column.js';
import { NotFoundError } from '../../lib/errors.js';

export interface DeletionResult {
  deletedCallSessions: number;
  deletedTranscripts: number;
  deletedEvents: number;
  deletedCosts: number;
  deletedProfile: boolean;
}

/**
 * GDPR Article 17 — Right to Erasure.
 * Deletes a patient and all associated data for a tenant.
 * Cascades through: call cost line items → call costs → call events
 *   → call transcripts → call sessions → patient profile.
 */
export async function deletePatientAndAllData(input: {
  tenantId: string;
  patientId: string;
}): Promise<DeletionResult> {
  const log = logger.child({ module: 'patient-deletion', ...input });

  // Verify patient exists and belongs to this tenant
  const [patient] = await db
    .select()
    .from(patientProfiles)
    .where(
      and(eq(patientProfiles.id, input.patientId), eq(patientProfiles.tenantId, input.tenantId)),
    )
    .limit(1);

  if (!patient) throw new NotFoundError('Patient not found');

  // Find all call sessions linked to this patient's phone (via hash)
  const phoneHash = patient.phoneNumberHash ?? hashForSearch(patient.phoneNumber);
  const sessions = await db
    .select({ id: callSessions.id })
    .from(callSessions)
    .where(
      and(eq(callSessions.tenantId, input.tenantId), eq(callSessions.callerNumberHash, phoneHash)),
    );

  const sessionIds = sessions.map((s) => s.id);
  log.info({ sessionCount: sessionIds.length }, 'Found call sessions for deletion');

  return db.transaction(async (tx) => {
    let deletedTranscripts = 0;
    let deletedEvents = 0;
    let deletedCosts = 0;

    if (sessionIds.length > 0) {
      // Delete in dependency order: line items → costs → events → transcripts → sessions
      await tx
        .delete(callCostLineItems)
        .where(
          and(
            eq(callCostLineItems.tenantId, input.tenantId),
            inArray(callCostLineItems.callSessionId, sessionIds),
          ),
        );

      const deletedCostsResult = await tx
        .delete(callCosts)
        .where(
          and(eq(callCosts.tenantId, input.tenantId), inArray(callCosts.callSessionId, sessionIds)),
        )
        .returning({ id: callCosts.id });
      deletedCosts = deletedCostsResult.length;

      const deletedEventsResult = await tx
        .delete(callEvents)
        .where(
          and(
            eq(callEvents.tenantId, input.tenantId),
            inArray(callEvents.callSessionId, sessionIds),
          ),
        )
        .returning({ id: callEvents.id });
      deletedEvents = deletedEventsResult.length;

      const deletedTranscriptsResult = await tx
        .delete(callTranscripts)
        .where(
          and(
            eq(callTranscripts.tenantId, input.tenantId),
            inArray(callTranscripts.callSessionId, sessionIds),
          ),
        )
        .returning({ id: callTranscripts.id });
      deletedTranscripts = deletedTranscriptsResult.length;
    }

    const deletedSessionsResult = await tx
      .delete(callSessions)
      .where(and(eq(callSessions.tenantId, input.tenantId), inArray(callSessions.id, sessionIds)))
      .returning({ id: callSessions.id });

    await tx
      .delete(patientProfiles)
      .where(
        and(eq(patientProfiles.id, input.patientId), eq(patientProfiles.tenantId, input.tenantId)),
      );

    log.info(
      {
        deletedCallSessions: deletedSessionsResult.length,
        deletedTranscripts,
        deletedEvents,
        deletedCosts,
      },
      'Patient erasure complete',
    );

    return {
      deletedCallSessions: deletedSessionsResult.length,
      deletedTranscripts,
      deletedEvents,
      deletedCosts,
      deletedProfile: true,
    };
  });
}
