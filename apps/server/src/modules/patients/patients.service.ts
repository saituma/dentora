import { and, eq, isNull, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { patientProfiles } from '../../db/schema.js';
import { encryptField, decryptField, hashForSearch } from '../../lib/encrypted-column.js';
import { assertTenantAccess } from '../../db/tenant-context.js';

export type PatientProfileRecord = {
  id: string;
  tenantId: string;
  fullName: string;
  dateOfBirth: string | null;
  phoneNumber: string;
  phoneNumberHash: string | null;
  lastVisitAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function decryptRow(row: typeof patientProfiles.$inferSelect): PatientProfileRecord {
  return {
    ...row,
    fullName: decryptField(row.fullName) ?? '',
    phoneNumber: decryptField(row.phoneNumber) ?? '',
    notes: decryptField(row.notes),
  };
}

export async function findPatientProfile(input: {
  tenantId: string;
  phoneNumber: string;
  dateOfBirth?: string | null;
}): Promise<PatientProfileRecord | null> {
  assertTenantAccess(input.tenantId);
  const phoneHash = hashForSearch(input.phoneNumber);
  const normalizedDob = input.dateOfBirth?.trim() ?? null;
  const dobFilter = normalizedDob
    ? eq(patientProfiles.dateOfBirth, normalizedDob)
    : isNull(patientProfiles.dateOfBirth);

  const [row] = await db
    .select()
    .from(patientProfiles)
    .where(
      and(
        eq(patientProfiles.tenantId, input.tenantId),
        eq(patientProfiles.phoneNumberHash, phoneHash),
        dobFilter,
      ),
    )
    .limit(1);

  return row ? decryptRow(row) : null;
}

export async function findPatientProfileByPhone(input: {
  tenantId: string;
  phoneNumber: string;
}): Promise<PatientProfileRecord | null> {
  assertTenantAccess(input.tenantId);
  const phoneHash = hashForSearch(input.phoneNumber);

  const [row] = await db
    .select()
    .from(patientProfiles)
    .where(
      and(
        eq(patientProfiles.tenantId, input.tenantId),
        eq(patientProfiles.phoneNumberHash, phoneHash),
      ),
    )
    .limit(1);

  return row ? decryptRow(row) : null;
}

export async function getPatientProfileById(input: {
  tenantId: string;
  patientId: string;
}): Promise<PatientProfileRecord | null> {
  assertTenantAccess(input.tenantId);
  const [row] = await db
    .select()
    .from(patientProfiles)
    .where(
      and(eq(patientProfiles.tenantId, input.tenantId), eq(patientProfiles.id, input.patientId)),
    )
    .limit(1);

  return row ? decryptRow(row) : null;
}

export async function upsertPatientProfile(input: {
  tenantId: string;
  fullName: string;
  dateOfBirth?: string | null;
  phoneNumber: string;
  lastVisitAt?: Date | null;
  notes?: string | null;
}): Promise<PatientProfileRecord> {
  assertTenantAccess(input.tenantId);
  const now = new Date();
  const plainPhone = input.phoneNumber.trim();
  const phoneHash = hashForSearch(plainPhone);

  const payload = {
    tenantId: input.tenantId,
    fullName: encryptField(input.fullName.trim()) as string,
    dateOfBirth: input.dateOfBirth?.trim() ?? null,
    phoneNumber: encryptField(plainPhone) as string,
    phoneNumberHash: phoneHash,
    lastVisitAt: input.lastVisitAt ?? null,
    notes: encryptField(input.notes ?? null),
    updatedAt: now,
  };

  if (!payload.dateOfBirth) {
    const [existing] = await db
      .select()
      .from(patientProfiles)
      .where(
        and(
          eq(patientProfiles.tenantId, payload.tenantId),
          eq(patientProfiles.phoneNumberHash, phoneHash),
          isNull(patientProfiles.dateOfBirth),
        ),
      )
      .limit(1);

    if (existing?.id) {
      const [updated] = await db
        .update(patientProfiles)
        .set(payload)
        .where(eq(patientProfiles.id, existing.id))
        .returning();
      return decryptRow(updated);
    }
  }

  const [row] = await db
    .insert(patientProfiles)
    .values({ ...payload, createdAt: now })
    .onConflictDoUpdate({
      target: [patientProfiles.phoneNumberHash],
      set: payload,
    })
    .returning();

  return decryptRow(row);
}

export async function listPatientProfiles(input: {
  tenantId: string;
  search?: string | null;
  limit?: number;
}): Promise<PatientProfileRecord[]> {
  assertTenantAccess(input.tenantId);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const search = input.search?.trim();

  // Fetch a larger batch when searching so we have rows to filter after decryption
  const fetchLimit = search ? 500 : limit;

  const rows = await db
    .select()
    .from(patientProfiles)
    .where(eq(patientProfiles.tenantId, input.tenantId))
    .orderBy(desc(patientProfiles.lastVisitAt), desc(patientProfiles.updatedAt))
    .limit(fetchLimit);

  const decrypted = rows.map(decryptRow);

  if (!search) return decrypted.slice(0, limit);

  const lower = search.toLowerCase();
  return decrypted
    .filter((p) => p.fullName.toLowerCase().includes(lower) || p.phoneNumber.includes(lower))
    .slice(0, limit);
}
