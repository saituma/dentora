import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  '../../apps/server/drizzle/0015_appointment_rls_policies.sql',
);
const journalPath = resolve(process.cwd(), '../../apps/server/drizzle/meta/_journal.json');

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

describe('appointment RLS migration', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  const normalizedMigration = normalizeSql(migration);

  it('adds forced RLS for appointments and appointment holds', () => {
    expect(normalizedMigration).toContain('ALTER TABLE appointments ENABLE ROW LEVEL SECURITY');
    expect(normalizedMigration).toContain('ALTER TABLE appointments FORCE ROW LEVEL SECURITY');
    expect(normalizedMigration).toContain(
      'ALTER TABLE appointment_holds ENABLE ROW LEVEL SECURITY',
    );
    expect(normalizedMigration).toContain('ALTER TABLE appointment_holds FORCE ROW LEVEL SECURITY');
  });

  it('scopes appointment reads and writes to the current tenant setting', () => {
    expect(normalizedMigration).toContain(
      'CREATE POLICY appointments_tenant_isolation ON appointments FOR ALL TO PUBLIC',
    );
    expect(normalizedMigration).toContain(
      "USING ( tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid )",
    );
    expect(normalizedMigration).toContain(
      "WITH CHECK ( tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid )",
    );
  });

  it('scopes appointment hold reads and writes to the current tenant setting', () => {
    expect(normalizedMigration).toContain(
      'CREATE POLICY appointment_holds_tenant_isolation ON appointment_holds FOR ALL TO PUBLIC',
    );
    expect(normalizedMigration).toContain(
      "USING ( tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid )",
    );
    expect(normalizedMigration).toContain(
      "WITH CHECK ( tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid )",
    );
  });

  it('registers the migration in the Drizzle journal', () => {
    const journal = readFileSync(journalPath, 'utf8');
    expect(journal).toContain('"idx": 14');
    expect(journal).toContain('"tag": "0015_appointment_rls_policies"');
  });
});
