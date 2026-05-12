/**
 * PostgreSQL backup script: pg_dump → AES-256-GCM encrypt → DigitalOcean Spaces.
 *
 * Usage:
 *   npx tsx apps/server/scripts/backup-postgres.ts
 *
 * Required env vars (in addition to normal server env):
 *   DATABASE_URL              — Postgres connection string
 *   ENCRYPTION_KEY            — 64-hex AES key (same as server)
 *   DO_SPACES_ENDPOINT        — e.g. https://lon1.digitaloceanspaces.com
 *   DO_SPACES_BUCKET          — bucket name
 *   DO_SPACES_ACCESS_KEY_ID   — Spaces access key
 *   DO_SPACES_SECRET_KEY      — Spaces secret key
 *   DO_SPACES_REGION          — e.g. lon1
 *   BACKUP_RETENTION_DAYS     — days to keep backups (default: 30)
 */

import { execSync, spawn } from 'child_process';
import { createCipheriv, randomBytes } from 'crypto';
import { PassThrough } from 'stream';
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const CHUNK = 64 * 1024;

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function getS3Client(): S3Client {
  return new S3Client({
    endpoint: requireEnv('DO_SPACES_ENDPOINT'),
    region: requireEnv('DO_SPACES_REGION'),
    credentials: {
      accessKeyId: requireEnv('DO_SPACES_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('DO_SPACES_SECRET_KEY'),
    },
    forcePathStyle: false,
  });
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
}

async function runBackup(): Promise<void> {
  const databaseUrl = requireEnv('DATABASE_URL');
  const encryptionKey = requireEnv('ENCRYPTION_KEY');
  const bucket = requireEnv('DO_SPACES_BUCKET');
  const retentionDays = parseInt(process.env['BACKUP_RETENTION_DAYS'] ?? '30', 10);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupKey = `backups/postgres/${timestamp}.sql.gz.enc`;

  console.log(`Starting backup → s3://${bucket}/${backupKey}`);

  // Spawn pg_dump and pipe through gzip
  const pgDump = spawn('pg_dump', ['--format=plain', '--no-owner', '--no-acl', databaseUrl], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const gzip = spawn('gzip', ['-9'], { stdio: ['pipe', 'pipe', 'pipe'] });
  pgDump.stdout.pipe(gzip.stdin);

  pgDump.stderr.on('data', (d: Buffer) => process.stderr.write(d));
  gzip.stderr.on('data', (d: Buffer) => process.stderr.write(d));

  // Encrypt the gzip stream with AES-256-GCM
  const key = Buffer.from(encryptionKey, 'hex');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: 16 });

  const encryptedChunks: Buffer[] = [iv]; // prepend IV so we can decrypt later
  const pt = new PassThrough();
  gzip.stdout.pipe(pt);

  for await (const chunk of pt) {
    encryptedChunks.push(cipher.update(chunk as Buffer));
  }
  encryptedChunks.push(cipher.final());
  encryptedChunks.push(cipher.getAuthTag()); // append auth tag at end

  await new Promise<void>((resolve, reject) => {
    pgDump.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`pg_dump exited ${code}`))));
  });
  await new Promise<void>((resolve, reject) => {
    gzip.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`gzip exited ${code}`))));
  });

  const encryptedBuffer = Buffer.concat(encryptedChunks);
  console.log(`Dump size (encrypted): ${(encryptedBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  // Upload to DigitalOcean Spaces
  const s3 = getS3Client();
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: backupKey,
    Body: encryptedBuffer,
    ContentType: 'application/octet-stream',
    Metadata: {
      'backup-timestamp': timestamp,
      'backup-iv': iv.toString('hex'),
      'encryption-algorithm': ALGORITHM,
    },
  }));

  console.log(`Backup uploaded: ${backupKey}`);

  // Prune backups older than retentionDays
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const list = await s3.send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: 'backups/postgres/',
  }));

  const toDelete = (list.Contents ?? []).filter((obj) => {
    return obj.Key && obj.LastModified && obj.LastModified < cutoff;
  });

  if (toDelete.length > 0) {
    await s3.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: toDelete.map((obj) => ({ Key: obj.Key! })),
      },
    }));
    console.log(`Pruned ${toDelete.length} backup(s) older than ${retentionDays} days`);
  }

  console.log('Backup complete');
}

runBackup().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
