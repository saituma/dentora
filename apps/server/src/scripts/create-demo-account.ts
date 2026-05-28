/* eslint-disable no-console */
import 'dotenv/config';
import { db } from '../db/index.js';
import { users, tenantRegistry, tenantUsers } from '../db/schema.js';
import { hashPassword, generateId } from '../lib/crypto.js';
import { eq } from 'drizzle-orm';

const EMAIL = 'demo@dentora.com';
const PASSWORD = 'Password123!';
const CLINIC_NAME = 'Dentora Demo';

async function main() {
  // Check if already exists
  const [existing] = await db.select().from(users).where(eq(users.email, EMAIL)).limit(1);
  if (existing) {
    console.log(`User ${EMAIL} already exists (id: ${existing.id}) — skipping creation.`);
    const [tenantLink] = await db
      .select()
      .from(tenantUsers)
      .where(eq(tenantUsers.userId, existing.id))
      .limit(1);
    const [tenant] = tenantLink
      ? await db
          .select()
          .from(tenantRegistry)
          .where(eq(tenantRegistry.id, tenantLink.tenantId))
          .limit(1)
      : [];
    console.log(`Tenant: ${tenant?.clinicName ?? 'none'} (${tenantLink?.tenantId ?? 'none'})`);
    return;
  }

  const userId = generateId();
  const tenantId = generateId();
  const passwordHash = await hashPassword(PASSWORD);

  await db.transaction(async (tx) => {
    await tx.insert(tenantRegistry).values({
      id: tenantId,
      clinicName: CLINIC_NAME,
      clinicSlug: 'dentora-demo-' + userId.slice(0, 6),
      plan: 'starter',
      status: 'active',
    });

    await tx.insert(users).values({
      id: userId,
      email: EMAIL,
      passwordHash,
      displayName: 'Dentora Demo',
      role: 'owner',
      emailVerified: true,
    });

    await tx.insert(tenantUsers).values({
      id: generateId(),
      tenantId,
      userId,
      role: 'admin',
    });
  });

  console.log('✅  Demo account created');
  console.log(`   Email    : ${EMAIL}`);
  console.log(`   Password : ${PASSWORD}`);
  console.log(`   User ID  : ${userId}`);
  console.log(`   Tenant   : ${CLINIC_NAME} (${tenantId})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
