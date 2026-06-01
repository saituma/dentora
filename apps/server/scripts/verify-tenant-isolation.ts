/**
 * Tenant-isolation verification harness (Phase 0 backstop).
 *
 * Two checks against the configured DATABASE_URL:
 *   1. STRUCTURAL — every table in RLS_TENANT_TABLES has RLS enabled + FORCEd and
 *      a policy whose USING and WITH CHECK both reference app.current_tenant_id.
 *   2. BEHAVIORAL — seeds two tenants + patient_profiles rows and, acting as a
 *      NON-superuser role (so RLS actually applies), proves:
 *        - a tenant only sees its own rows,
 *        - WITH CHECK blocks inserting another tenant's row,
 *        - UPDATE/DELETE cannot touch another tenant's rows,
 *        - an empty tenant GUC fails OPEN (all rows visible) — the additive,
 *          never-an-outage posture; app-level eq(tenantId) covers those paths.
 *
 * All behavioral work runs inside a single transaction that is ROLLED BACK, so
 * no test data (or the temp role) persists. Exits non-zero on any failure, so it
 * doubles as a CI gate. Safe to run only against a local/staging DB.
 *
 *   pnpm --filter @repo/server verify:tenant-isolation
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { RLS_TENANT_TABLES } from '../src/db/rls-tables.js';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const TEST_ROLE = 'rls_verify_tmp';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const host = new URL(connectionString).host;
  if (!/localhost|127\.0\.0\.1/.test(host)) {
    // Behavioral check seeds + rolls back real rows; refuse to run against remote DBs by default.
    if (process.env.ALLOW_REMOTE_RLS_VERIFY !== 'true') {
      throw new Error(
        `Refusing to run against non-local DB host "${host}". Set ALLOW_REMOTE_RLS_VERIFY=true to override (staging only).`,
      );
    }
  }

  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  const failures: string[] = [];

  try {
    // ── 1. STRUCTURAL ──────────────────────────────────────────────────────────
    const { rows: classes } = await client.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relname = any($1)`,
      [RLS_TENANT_TABLES as unknown as string[]],
    );
    const byName = new Map(classes.map((r) => [r.relname, r]));

    const { rows: policies } = await client.query<{
      tablename: string;
      qual: string | null;
      with_check: string | null;
    }>(
      `select tablename, qual, with_check from pg_policies
        where schemaname = 'public' and tablename = any($1)`,
      [RLS_TENANT_TABLES as unknown as string[]],
    );
    const policiesByTable = new Map<string, typeof policies>();
    for (const p of policies) {
      const list = policiesByTable.get(p.tablename) ?? [];
      list.push(p);
      policiesByTable.set(p.tablename, list);
    }

    for (const table of RLS_TENANT_TABLES) {
      const c = byName.get(table);
      if (!c) {
        failures.push(`${table}: table not found`);
        continue;
      }
      if (!c.relrowsecurity) failures.push(`${table}: RLS not ENABLED`);
      if (!c.relforcerowsecurity) failures.push(`${table}: RLS not FORCED`);
      const pols = policiesByTable.get(table) ?? [];
      if (pols.length === 0) {
        failures.push(`${table}: no RLS policy`);
        continue;
      }
      const hasUsing = pols.some((p) => p.qual?.includes('app.current_tenant_id'));
      const hasCheck = pols.some((p) => p.with_check?.includes('app.current_tenant_id'));
      if (!hasUsing) failures.push(`${table}: policy missing USING tenant predicate`);
      if (!hasCheck) failures.push(`${table}: policy missing WITH CHECK tenant predicate`);
    }

    // ── 2. BEHAVIORAL (patient_profiles, as a non-superuser role) ───────────────
    await client.query('BEGIN');
    // Temp non-superuser role so RLS is actually enforced (superusers bypass it).
    await client.query(`CREATE ROLE ${TEST_ROLE} NOSUPERUSER NOINHERIT`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${TEST_ROLE}`);
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_registry, patient_profiles TO ${TEST_ROLE}`,
    );

    // Seed two tenants (tenant_registry has no RLS).
    await client.query(
      `INSERT INTO tenant_registry (id, clinic_name, clinic_slug)
       VALUES ($1, 'RLS Verify A', 'rls-verify-a'), ($2, 'RLS Verify B', 'rls-verify-b')`,
      [TENANT_A, TENANT_B],
    );

    await client.query(`SET ROLE ${TEST_ROLE}`);

    const setTenant = (t: string) =>
      client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [t]);

    // Insert Alice as tenant A.
    await setTenant(TENANT_A);
    await client.query(
      `INSERT INTO patient_profiles (tenant_id, full_name, phone_number) VALUES ($1, 'Alice', '+440000000A')`,
      [TENANT_A],
    );

    // Cross-tenant INSERT while acting as A must be blocked by WITH CHECK.
    // The expected failure aborts the statement, so isolate it in a SAVEPOINT
    // and roll back to it to keep the surrounding transaction usable.
    let checkBlocked = false;
    await client.query('SAVEPOINT cross_tenant_insert');
    try {
      await client.query(
        `INSERT INTO patient_profiles (tenant_id, full_name, phone_number) VALUES ($1, 'Mallory', '+440000000X')`,
        [TENANT_B],
      );
      await client.query('RELEASE SAVEPOINT cross_tenant_insert');
    } catch {
      checkBlocked = true;
      await client.query('ROLLBACK TO SAVEPOINT cross_tenant_insert');
    }
    if (!checkBlocked) failures.push('WITH CHECK did not block cross-tenant INSERT');

    // Insert Bob as tenant B.
    await setTenant(TENANT_B);
    await client.query(
      `INSERT INTO patient_profiles (tenant_id, full_name, phone_number) VALUES ($1, 'Bob', '+440000000B')`,
      [TENANT_B],
    );

    // As A: only Alice visible.
    await setTenant(TENANT_A);
    const seenAsA = await client.query<{ tenant_id: string }>(
      `SELECT tenant_id FROM patient_profiles`,
    );
    if (seenAsA.rows.length === 0) failures.push('SELECT as tenant A returned 0 rows (expected Alice)');
    if (seenAsA.rows.some((r) => r.tenant_id !== TENANT_A))
      failures.push('SELECT as tenant A leaked another tenant rows');

    // As A: cannot mutate B's rows.
    const upd = await client.query(`UPDATE patient_profiles SET full_name = 'hacked' WHERE tenant_id = $1`, [
      TENANT_B,
    ]);
    if ((upd.rowCount ?? 0) > 0) failures.push('UPDATE as tenant A modified tenant B rows');
    const del = await client.query(`DELETE FROM patient_profiles WHERE tenant_id = $1`, [TENANT_B]);
    if ((del.rowCount ?? 0) > 0) failures.push('DELETE as tenant A removed tenant B rows');

    // Empty GUC → fail OPEN: both tenants' rows visible (degrades to no-RLS, never an outage).
    await setTenant('');
    const noCtx = await client.query<{ tenant_id: string }>(`SELECT tenant_id FROM patient_profiles`);
    const tenantsSeen = new Set(noCtx.rows.map((r) => r.tenant_id));
    if (!tenantsSeen.has(TENANT_A) || !tenantsSeen.has(TENANT_B)) {
      failures.push('Empty tenant GUC did not fail open (expected both tenants visible)');
    }

    await client.query('RESET ROLE');
    await client.query('ROLLBACK');
  } catch (err) {
    try {
      await client.query('RESET ROLE');
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
    await pool.end();
  }

  if (failures.length > 0) {
    console.error(`\n✗ TENANT ISOLATION CHECK FAILED (${failures.length}):`);
    for (const f of failures) console.error(`   - ${f}`);
    process.exit(1);
  }
  console.log(
    `✓ Tenant isolation verified — ${RLS_TENANT_TABLES.length} tables FORCEd with USING+WITH CHECK policies; patient_profiles behavioral checks passed.`,
  );
}

main().catch((err) => {
  console.error('verify-tenant-isolation crashed:', err);
  process.exit(1);
});
