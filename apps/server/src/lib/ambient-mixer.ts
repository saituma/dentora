import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from './logger.js';

const AMBIENT_VOLUME = 0.3;

let ambientBuffer: Buffer | null = null;

try {
  ambientBuffer = readFileSync(join(__dirname, '../assets/clinic-ambient.mulaw'));
  const durationSec = (ambientBuffer.length / 8000).toFixed(1);
  logger.info(
    `[ambient-mixer] Loaded clinic ambient (${durationSec}s, ${ambientBuffer.length} bytes)`,
  );
} catch {
  logger.warn('[ambient-mixer] No clinic-ambient.mulaw found — ambient noise disabled');
}

function mulawDecode(u: number): number {
  u = ~u & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = ((mantissa << 1) + 33) << exponent;
  sample -= 33;
  return sign ? -sample : sample;
}

function mulawEncode(sample: number): number {
  const sign = sample < 0 ? 0x80 : 0;
  if (sign) sample = -sample;
  if (sample > 32767) sample = 32767;
  sample += 33;
  let exponent = 7;
  for (let exp = 0; exp < 8; exp++) {
    if (sample <= 33 << (exp + 1)) {
      exponent = exp;
      break;
    }
  }
  const mantissa = (sample >> (exponent + 1)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

export function mixAmbient(
  agentBase64: string,
  ambientOffset: number,
): { mixed: string; newOffset: number } {
  if (!ambientBuffer || ambientBuffer.length === 0) {
    return { mixed: agentBase64, newOffset: ambientOffset };
  }

  const agentBytes = Buffer.from(agentBase64, 'base64');
  const mixedBytes = Buffer.allocUnsafe(agentBytes.length);
  const len = ambientBuffer.length;

  let offset = ambientOffset;
  for (let i = 0; i < agentBytes.length; i++) {
    const agentSample = mulawDecode(agentBytes[i]!);
    const ambientSample = mulawDecode(ambientBuffer[offset % len]!);
    const mixed = Math.max(
      -32768,
      Math.min(32767, agentSample + Math.round(ambientSample * AMBIENT_VOLUME)),
    );
    mixedBytes[i] = mulawEncode(mixed);
    offset = (offset + 1) % len;
  }

  return { mixed: mixedBytes.toString('base64'), newOffset: offset };
}

export function isAmbientLoaded(): boolean {
  return ambientBuffer !== null && ambientBuffer.length > 0;
}

export function getAmbientChunk(
  ambientOffset: number,
  byteCount: number,
): { chunk: string; newOffset: number } {
  if (!ambientBuffer || ambientBuffer.length === 0) {
    return { chunk: Buffer.alloc(byteCount, 0xff).toString('base64'), newOffset: ambientOffset };
  }

  const len = ambientBuffer.length;
  const out = Buffer.allocUnsafe(byteCount);
  let offset = ambientOffset;

  for (let i = 0; i < byteCount; i++) {
    const ambientSample = mulawDecode(ambientBuffer[offset % len]!);
    const scaled = Math.max(-32768, Math.min(32767, Math.round(ambientSample * AMBIENT_VOLUME)));
    out[i] = mulawEncode(scaled);
    offset = (offset + 1) % len;
  }

  return { chunk: out.toString('base64'), newOffset: offset };
}
