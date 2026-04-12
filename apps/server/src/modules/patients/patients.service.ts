import { and, eq, ilike, or, desc, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { patientProfiles } from '../../db/schema.js';

export type PatientProfileRecord = {
  id: string;
  tenantId: string;
  fullName: string;
  dateOfBirth: string | null;
  phoneNumber: string;
  lastVisitAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function findPatientProfile(input: {
  tenantId: string;
  phoneNumber: string;
  dateOfBirth?: string | null;
}): Promise<PatientProfileRecord | null> {
  const normalizedDob = input.dateOfBirth?.trim() ?? null;
  const dobFilter = normalizedDob
    ? eq(patientProfiles.dateOfBirth, normalizedDob)
    : isNull(patientProfiles.dateOfBirth);

  const [row] = await db
    .select()
    .from(patientProfiles)
    .where(and(
      eq(patientProfiles.tenantId, input.tenantId),
      eq(patientProfiles.phoneNumber, input.phoneNumber.trim()),
      dobFilter,
    ))
    .limit(1);

  return (row as PatientProfileRecord | undefined) ?? null;
}

export async function findPatientProfileByPhone(input: {
  tenantId: string;
  phoneNumber: string;
}): Promise<PatientProfileRecord | null> {
  const [row] = await db
    .select()
    .from(patientProfiles)
    .where(and(
      eq(patientProfiles.tenantId, input.tenantId),
      eq(patientProfiles.phoneNumber, input.phoneNumber.trim()),
    ))
    .limit(1);

  return (row as PatientProfileRecord | undefined) ?? null;
}

export async function getPatientProfileById(input: {
  tenantId: string;
  patientId: string;
}): Promise<PatientProfileRecord | null> {
  const [row] = await db
    .select()
    .from(patientProfiles)
    .where(and(
      eq(patientProfiles.tenantId, input.tenantId),
      eq(patientProfiles.id, input.patientId),
    ))
    .limit(1);

  return (row as PatientProfileRecord | undefined) ?? null;
}

export async function upsertPatientProfile(input: {
  tenantId: string;
  fullName: string;
  dateOfBirth?: string | null;
  phoneNumber: string;
  lastVisitAt?: Date | null;
  notes?: string | null;
}): Promise<PatientProfileRecord> {
  const now = new Date();
  const payload = {
    tenantId: input.tenantId,
    fullName: input.fullName.trim(),
    dateOfBirth: input.dateOfBirth?.trim() ?? null,
    phoneNumber: input.phoneNumber.trim(),
    lastVisitAt: input.lastVisitAt ?? null,
    notes: input.notes ?? null,
    updatedAt: now,
  };

  if (!payload.dateOfBirth) {
    const [existing] = await db
      .select()
      .from(patientProfiles)
      .where(and(
        eq(patientProfiles.tenantId, payload.tenantId),
        eq(patientProfiles.phoneNumber, payload.phoneNumber),
        isNull(patientProfiles.dateOfBirth),
      ))
      .limit(1);

    if (existing?.id) {
      const [updated] = await db
        .update(patientProfiles)
        .set(payload)
        .where(eq(patientProfiles.id, existing.id))
        .returning();
      return updated as PatientProfileRecord;
    }
  }

  const [row] = await db
    .insert(patientProfiles)
    .values({
      ...payload,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [patientProfiles.tenantId, patientProfiles.phoneNumber, patientProfiles.dateOfBirth],
      set: payload,
    })
    .returning();

  return row as PatientProfileRecord;
}

export async function listPatientProfiles(input: {
  tenantId: string;
  search?: string | null;
  limit?: number;
}): Promise<PatientProfileRecord[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const filters = [eq(patientProfiles.tenantId, input.tenantId)];
  const search = input.search?.trim();

  if (search) {
    const pattern = `%${search}%`;
    filters.push(or(
      ilike(patientProfiles.fullName, pattern),
      ilike(patientProfiles.phoneNumber, pattern),
    )!);
  }

  return db
    .select()
    .from(patientProfiles)
    .where(and(...filters))
    .orderBy(desc(patientProfiles.lastVisitAt), desc(patientProfiles.updatedAt))
    .limit(limit) as Promise<PatientProfileRecord[]>;
}
