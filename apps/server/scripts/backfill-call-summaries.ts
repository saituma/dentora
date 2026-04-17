import 'dotenv/config';

import { db, closeDb } from '../src/db/index.js';
import { callTranscripts } from '../src/db/schema.js';
import { generateCallSummary } from '../src/modules/calls/call.service.js';
import { and, eq, isNull, or } from 'drizzle-orm';

const DEFAULT_LIMIT = 100;

async function main() {
  const limit = Number.parseInt(process.env.BACKFILL_LIMIT || '', 10) || DEFAULT_LIMIT;
  const tenantId = process.env.BACKFILL_TENANT_ID?.trim();

  const overwrite = process.env.BACKFILL_OVERWRITE === '1' || process.env.BACKFILL_OVERWRITE === 'true';
  const whereClause = tenantId
    ? (
      overwrite
        ? eq(callTranscripts.tenantId, tenantId)
        : and(
          eq(callTranscripts.tenantId, tenantId),
          or(isNull(callTranscripts.summary), eq(callTranscripts.summary, '')),
        )
    )
    : (
      overwrite
        ? undefined
        : or(isNull(callTranscripts.summary), eq(callTranscripts.summary, ''))
    );

  let query = db.select().from(callTranscripts);
  if (whereClause) {
    query = query.where(whereClause);
  }
  const rows = await query.limit(limit);

  if (rows.length === 0) {
    console.log('No call transcripts missing summaries.');
    return;
  }

  console.log(
    overwrite
      ? `Found ${rows.length} call transcripts to overwrite summaries. Generating...`
      : `Found ${rows.length} call transcripts missing summaries. Generating...`,
  );

  let updated = 0;
  for (const row of rows) {
    const summary = await generateCallSummary({
      tenantId: row.tenantId,
      callSessionId: row.callSessionId,
      transcriptTurns: (row.fullTranscript as Array<{ role?: string; content?: string; text?: string }>) ?? [],
    });

    if (!summary) {
      console.log(`- Skipped ${row.id} (no transcript or summary failed)`);
      continue;
    }

    await db
      .update(callTranscripts)
      .set({ summary })
      .where(eq(callTranscripts.id, row.id));

    updated += 1;
    console.log(`- Updated ${row.id}`);
  }

  console.log(`Done. Updated ${updated} summaries.`);
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
