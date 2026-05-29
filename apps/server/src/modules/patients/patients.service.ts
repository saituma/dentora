import { and, eq, isNull, desc, sql } from 'drizzle-orm';
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
  messagingConsent: boolean;
  messagingConsentAt: Date | null;
  messagingOptedOutAt: Date | null;
  preferredReminderChannel: string;
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

/**
 * Records (or withdraws) a patient's consent to receive proactive SMS/WhatsApp messages.
 * GDPR: reminders are never sent unless messagingConsent is true and optOut is not set.
 */
export async function setPatientMessagingConsent(input: {
  tenantId: string;
  patientId: string;
  consent: boolean;
  preferredChannel?: 'sms' | 'whatsapp' | 'both' | 'none';
}): Promise<PatientProfileRecord | null> {
  assertTenantAccess(input.tenantId);
  const now = new Date();
  const [row] = await db
    .update(patientProfiles)
    .set({
      messagingConsent: input.consent,
      messagingConsentAt: input.consent ? now : null,
      messagingOptedOutAt: input.consent ? null : now,
      ...(input.preferredChannel ? { preferredReminderChannel: input.preferredChannel } : {}),
      updatedAt: now,
    })
    .where(
      and(eq(patientProfiles.tenantId, input.tenantId), eq(patientProfiles.id, input.patientId)),
    )
    .returning();
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
      target: [patientProfiles.tenantId, patientProfiles.phoneNumberHash],
      targetWhere: sql`${patientProfiles.phoneNumberHash} IS NOT NULL`,
      set: payload,
    })
    .returning();

  return decryptRow(row);
}

export type ImportResult = {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
};

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, '');
}

function pick(row: Record<string, string>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k]?.trim();
    if (v) return v;
  }
  return null;
}

export async function bulkImportPatients(input: {
  tenantId: string;
  rows: Record<string, string>[];
}): Promise<ImportResult> {
  assertTenantAccess(input.tenantId);
  let imported = 0;
  let skipped = 0;
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 0; i < input.rows.length; i++) {
    const rowNum = i + 2; // 1-indexed + header row
    const raw = input.rows[i];

    // Normalize all keys once
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      row[normalizeKey(k)] = String(v ?? '');
    }

    // Resolve full name — handle split first/last or combined
    const fullName =
      pick(row, 'fullname', 'name', 'patientname', 'patient') ??
      (() => {
        const first = pick(row, 'firstname', 'forename', 'givenname');
        const last = pick(row, 'lastname', 'surname', 'familyname');
        return first && last ? `${first} ${last}` : (first ?? last ?? null);
      })();

    const phoneNumber = pick(
      row,
      'phonenumber',
      'phone',
      'mobile',
      'mobilenumber',
      'tel',
      'telephone',
      'contactnumber',
    );

    if (!fullName || fullName.length < 2) {
      errors.push({ row: rowNum, message: 'Missing or invalid full name' });
      skipped++;
      continue;
    }
    if (!phoneNumber || phoneNumber.length < 7) {
      errors.push({ row: rowNum, message: 'Missing or invalid phone number' });
      skipped++;
      continue;
    }

    const dobRaw = pick(row, 'dateofbirth', 'dob', 'birthdate', 'birthday', 'dateofbirth');
    const lastVisitRaw = pick(row, 'lastvisitat', 'lastvisit', 'lastappointment', 'lastvisitdate');
    const notes = pick(row, 'notes', 'note', 'comments', 'comment', 'medicalhistory');

    let lastVisitAt: Date | null = null;
    if (lastVisitRaw) {
      const d = new Date(lastVisitRaw);
      if (!isNaN(d.getTime())) lastVisitAt = d;
    }

    try {
      await upsertPatientProfile({
        tenantId: input.tenantId,
        fullName,
        phoneNumber,
        dateOfBirth: dobRaw ?? null,
        lastVisitAt,
        notes: notes ?? null,
      });
      imported++;
    } catch (err) {
      errors.push({
        row: rowNum,
        message: err instanceof Error ? err.message : 'Failed to save row',
      });
      skipped++;
    }
  }

  return { imported, skipped, errors };
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
