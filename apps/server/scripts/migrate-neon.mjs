import fs from 'node:fs';
import crypto from 'node:crypto';
import { Client } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const journal = JSON.parse(fs.readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
const ignorableErrorCodes = new Set(['42710', '42P07', '42701', '42P06']);

const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();

  await client.query('CREATE SCHEMA IF NOT EXISTS drizzle');
  await client.query('CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)');

  for (const entry of journal.entries) {
    const migrationPath = new URL(`../drizzle/${entry.tag}.sql`, import.meta.url);
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    const migrationHash = crypto.createHash('sha256').update(migrationSql).digest('hex');

    const statements = migrationSql
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean)
      .map((statement) => `${statement};`);

    let applied = 0;
    let skipped = 0;

    for (let index = 0; index < statements.length; index += 1) {
      const statement = statements[index];
      try {
        await client.query(statement);
        applied += 1;
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
        if (ignorableErrorCodes.has(code)) {
          skipped += 1;
          continue;
        }

        console.error(`Migration ${entry.tag} failed at statement #${index + 1} (${code || 'unknown'})`);
        console.error(statement.slice(0, 600));
        throw error;
      }
    }

    await client.query(`DELETE FROM drizzle.__drizzle_migrations WHERE created_at = ${Number(entry.when)}`);
    await client.query(`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('${migrationHash}', ${Number(entry.when)})`);

    console.log(`APPLIED ${entry.tag} applied=${applied} skipped=${skipped}`);
  }

  const rows = await client.query('SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at');
  console.log(`MIGRATION_ROWS ${rows.rows.length}`);
  console.log(JSON.stringify(rows.rows, null, 2));
} finally {
  await client.end();
}
