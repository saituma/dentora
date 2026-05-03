import { AwsClient } from 'aws4fetch';
import { env } from '../config/env.js';
import { logger } from './logger.js';

let r2Client: AwsClient | null = null;

function getR2Client(): AwsClient {
  if (r2Client) return r2Client;
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_ACCOUNT_ID) {
    throw new Error('Cloudflare R2 is not configured (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID required)');
  }
  r2Client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    region: 'auto',
    service: 's3',
  });
  return r2Client;
}

function buildR2Url(key: string): string {
  return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key}`;
}

export function isStorageConfigured(): boolean {
  return Boolean(env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ACCOUNT_ID && env.R2_BUCKET);
}

export async function uploadFile(input: {
  key: string;
  body: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
}): Promise<{ key: string; size: number }> {
  const client = getR2Client();
  const url = buildR2Url(input.key);

  const headers: Record<string, string> = {
    'Content-Type': input.contentType,
  };
  if (input.metadata) {
    for (const [k, v] of Object.entries(input.metadata)) {
      headers[`x-amz-meta-${k}`] = v;
    }
  }

  const response = await client.fetch(url, {
    method: 'PUT',
    headers,
    body: new Uint8Array(input.body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error({ key: input.key, status: response.status, error: errorText }, 'R2 upload failed');
    throw new Error(`R2 upload failed: ${response.status}`);
  }

  return { key: input.key, size: input.body.length };
}

export async function downloadFile(key: string): Promise<{ body: Buffer; contentType: string }> {
  const client = getR2Client();
  const url = buildR2Url(key);

  const response = await client.fetch(url, { method: 'GET' });
  if (!response.ok) {
    if (response.status === 404) throw new Error(`File not found: ${key}`);
    throw new Error(`R2 download failed: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    body: Buffer.from(arrayBuffer),
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
  };
}

export async function deleteFile(key: string): Promise<void> {
  const client = getR2Client();
  const url = buildR2Url(key);

  const response = await client.fetch(url, { method: 'DELETE' });
  if (!response.ok && response.status !== 404) {
    throw new Error(`R2 delete failed: ${response.status}`);
  }
}

export async function getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  const client = getR2Client();
  const url = new URL(buildR2Url(key));
  url.searchParams.set('X-Amz-Expires', String(expiresInSeconds));

  const signed = await client.sign(url.toString(), { method: 'GET' });
  return signed.url;
}

export function buildStorageKey(tenantId: string, category: string, filename: string): string {
  const timestamp = Date.now();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `tenants/${tenantId}/${category}/${timestamp}-${safeName}`;
}
