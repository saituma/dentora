import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { patientProfiles, callSessions, callTranscripts, callEvents } from '../../db/schema.js';
import { decryptField, hashForSearch } from '../../lib/encrypted-column.js';
import { NotFoundError } from '../../lib/errors.js';

export interface PatientDataExport {
  exportedAt: string;
  subject: {
    id: string;
    fullName: string;
    dateOfBirth: string | null;
    phoneNumber: string;
    notes: string | null;
    lastVisitAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  callHistory: Array<{
    id: string;
    startedAt: string;
    endedAt: string | null;
    durationSeconds: number | null;
    status: string;
    intentSummary: string | null;
    transcript: {
      summary: string | null;
      sentiment: string | null;
      intentDetected: string | null;
      entries: unknown[];
    } | null;
    events: Array<{
      eventType: string;
      actor: string | null;
      timestamp: string;
    }>;
  }>;
}

/**
 * GDPR Article 15 / 20 — Right of Access + Data Portability.
 * Returns all personal data held for a patient in a structured, portable format.
 */
export async function exportPatientData(input: {
  tenantId: string;
  patientId: string;
}): Promise<PatientDataExport> {
  const [patient] = await db
    .select()
    .from(patientProfiles)
    .where(
      and(eq(patientProfiles.id, input.patientId), eq(patientProfiles.tenantId, input.tenantId)),
    )
    .limit(1);

  if (!patient) throw new NotFoundError('Patient not found');

  const phoneHash = patient.phoneNumberHash ?? hashForSearch(patient.phoneNumber);
  const sessions = await db
    .select()
    .from(callSessions)
    .where(
      and(eq(callSessions.tenantId, input.tenantId), eq(callSessions.callerNumberHash, phoneHash)),
    );

  const sessionIds = sessions.map((s) => s.id);

  const [transcripts, events] = await Promise.all([
    sessionIds.length > 0
      ? db
          .select()
          .from(callTranscripts)
          .where(
            and(
              eq(callTranscripts.tenantId, input.tenantId),
              inArray(callTranscripts.callSessionId, sessionIds),
            ),
          )
      : Promise.resolve([]),
    sessionIds.length > 0
      ? db
          .select({
            callSessionId: callEvents.callSessionId,
            eventType: callEvents.eventType,
            actor: callEvents.actor,
            timestamp: callEvents.timestamp,
          })
          .from(callEvents)
          .where(
            and(
              eq(callEvents.tenantId, input.tenantId),
              inArray(callEvents.callSessionId, sessionIds),
            ),
          )
      : Promise.resolve([]),
  ]);

  const transcriptBySession = new Map(transcripts.map((t) => [t.callSessionId, t]));
  const eventsBySession = new Map<string, typeof events>();
  for (const evt of events) {
    const arr = eventsBySession.get(evt.callSessionId) ?? [];
    arr.push(evt);
    eventsBySession.set(evt.callSessionId, arr);
  }

  return {
    exportedAt: new Date().toISOString(),
    subject: {
      id: patient.id,
      fullName: decryptField(patient.fullName) ?? '',
      dateOfBirth: patient.dateOfBirth,
      phoneNumber: decryptField(patient.phoneNumber) ?? '',
      notes: decryptField(patient.notes),
      lastVisitAt: patient.lastVisitAt?.toISOString() ?? null,
      createdAt: patient.createdAt.toISOString(),
      updatedAt: patient.updatedAt.toISOString(),
    },
    callHistory: sessions.map((s) => {
      const transcript = transcriptBySession.get(s.id) ?? null;
      const sessionEvents = eventsBySession.get(s.id) ?? [];
      return {
        id: s.id,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt?.toISOString() ?? null,
        durationSeconds: s.durationSeconds,
        status: s.status,
        intentSummary: decryptField(s.intentSummary),
        transcript: transcript
          ? {
              summary: decryptField(transcript.summary),
              sentiment: transcript.sentiment,
              intentDetected: transcript.intentDetected,
              entries: transcript.fullTranscript as unknown[],
            }
          : null,
        events: sessionEvents.map((e) => ({
          eventType: e.eventType,
          actor: e.actor,
          timestamp: e.timestamp.toISOString(),
        })),
      };
    }),
  };
}
