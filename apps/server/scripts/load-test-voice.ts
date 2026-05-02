/**
 * Voice pipeline load test.
 *
 * Spawns N concurrent WebSocket connections to the media-stream endpoint,
 * each simulating a Twilio media stream with mu-law audio packets at
 * real-time cadence (20ms per packet). Measures connection latency,
 * message throughput, and error rates.
 *
 * Usage:
 *   MEDIA_STREAM_URL=ws://localhost:4000/media-stream \
 *   TENANT_ID=<id> CONFIG_VERSION_ID=<id> \
 *   CONCURRENT=10 DURATION_SECONDS=30 \
 *   tsx scripts/load-test-voice.ts
 */

import crypto from 'node:crypto';
import WebSocket from 'ws';

const CONCURRENT = parseInt(process.env.CONCURRENT || '5', 10);
const DURATION_SECONDS = parseInt(process.env.DURATION_SECONDS || '30', 10);
const PACKET_INTERVAL_MS = 20;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function base64Silence(bytes = 160): string {
  return Buffer.alloc(bytes, 0xff).toString('base64');
}

interface SessionStats {
  id: number;
  connectTimeMs: number;
  messagesSent: number;
  messagesReceived: number;
  errors: string[];
  disconnectedCleanly: boolean;
}

async function runSession(id: number, wsUrl: string, tenantId: string, configVersionId: string): Promise<SessionStats> {
  const stats: SessionStats = {
    id,
    connectTimeMs: 0,
    messagesSent: 0,
    messagesReceived: 0,
    errors: [],
    disconnectedCleanly: false,
  };

  const callSid = `CA${crypto.randomBytes(16).toString('hex')}`;
  const streamSid = `MZ${crypto.randomBytes(16).toString('hex')}`;
  const accountSid = process.env.TWILIO_ACCOUNT_SID || 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

  return new Promise<SessionStats>((resolve) => {
    const connectStart = Date.now();
    const ws = new WebSocket(wsUrl);
    let interval: ReturnType<typeof setInterval> | null = null;
    let seq = 2;
    let resolved = false;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      if (interval) clearInterval(interval);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event: 'stop', sequenceNumber: String(seq++), stop: { accountSid, callSid } }));
        ws.close();
        stats.disconnectedCleanly = true;
      }
      resolve(stats);
    };

    setTimeout(finish, DURATION_SECONDS * 1000);

    ws.on('open', () => {
      stats.connectTimeMs = Date.now() - connectStart;

      ws.send(JSON.stringify({ event: 'connected', protocol: 'Call', version: '1.0.0' }));
      ws.send(JSON.stringify({
        event: 'start',
        sequenceNumber: '1',
        start: {
          accountSid, streamSid, callSid,
          tracks: ['inbound'],
          mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 },
          customParameters: { tenantId, configVersionId, callSessionId: callSid },
        },
      }));
      stats.messagesSent += 2;

      const payload = base64Silence();
      interval = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({
          event: 'media',
          sequenceNumber: String(seq++),
          media: { track: 'inbound', chunk: String(seq), timestamp: String(Date.now()), payload },
        }));
        stats.messagesSent++;
      }, PACKET_INTERVAL_MS);
    });

    ws.on('message', () => { stats.messagesReceived++; });
    ws.on('error', (err) => { stats.errors.push(err.message); finish(); });
    ws.on('close', () => { stats.disconnectedCleanly = true; finish(); });
  });
}

async function main(): Promise<void> {
  const wsUrl = requireEnv('MEDIA_STREAM_URL');
  const tenantId = requireEnv('TENANT_ID');
  const configVersionId = requireEnv('CONFIG_VERSION_ID');

  console.warn(`\n── Voice Pipeline Load Test ──`);
  console.warn(`  Concurrent sessions: ${CONCURRENT}`);
  console.warn(`  Duration per session: ${DURATION_SECONDS}s`);
  console.warn(`  Target: ${wsUrl}`);
  console.warn(`  Packet interval: ${PACKET_INTERVAL_MS}ms\n`);

  const startTime = Date.now();

  const sessions = await Promise.all(
    Array.from({ length: CONCURRENT }, (_, i) =>
      runSession(i, wsUrl, tenantId, configVersionId),
    ),
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const connectTimes = sessions.map((s) => s.connectTimeMs);
  const totalSent = sessions.reduce((sum, s) => sum + s.messagesSent, 0);
  const totalReceived = sessions.reduce((sum, s) => sum + s.messagesReceived, 0);
  const totalErrors = sessions.reduce((sum, s) => sum + s.errors.length, 0);
  const cleanDisconnects = sessions.filter((s) => s.disconnectedCleanly).length;

  console.warn(`\n── Results (${elapsed}s wall time) ──\n`);
  console.warn(`  Sessions:         ${CONCURRENT}`);
  console.warn(`  Connect time:     avg=${avg(connectTimes).toFixed(0)}ms  p50=${percentile(connectTimes, 50).toFixed(0)}ms  p95=${percentile(connectTimes, 95).toFixed(0)}ms  max=${Math.max(...connectTimes)}ms`);
  console.warn(`  Messages sent:    ${totalSent} (${(totalSent / CONCURRENT).toFixed(0)}/session)`);
  console.warn(`  Messages received:${totalReceived} (${(totalReceived / CONCURRENT).toFixed(0)}/session)`);
  console.warn(`  Errors:           ${totalErrors}`);
  console.warn(`  Clean disconnect: ${cleanDisconnects}/${CONCURRENT}`);

  if (totalErrors > 0) {
    console.warn(`\n  Error details:`);
    for (const s of sessions) {
      for (const e of s.errors) {
        console.warn(`    Session ${s.id}: ${e}`);
      }
    }
  }

  const jsonReport = {
    timestamp: new Date().toISOString(),
    config: { concurrent: CONCURRENT, durationSeconds: DURATION_SECONDS, packetIntervalMs: PACKET_INTERVAL_MS },
    results: {
      wallTimeSeconds: parseFloat(elapsed),
      connectTimeMs: { avg: avg(connectTimes), p50: percentile(connectTimes, 50), p95: percentile(connectTimes, 95), max: Math.max(...connectTimes) },
      messagesSent: totalSent,
      messagesReceived: totalReceived,
      errors: totalErrors,
      cleanDisconnects,
      sessions: sessions.map(({ id, connectTimeMs, messagesSent, messagesReceived, errors, disconnectedCleanly }) => ({
        id, connectTimeMs, messagesSent, messagesReceived, errorCount: errors.length, disconnectedCleanly,
      })),
    },
  };

  console.log(JSON.stringify(jsonReport, null, 2));

  if (totalErrors > 0 || cleanDisconnects < CONCURRENT) {
    process.exit(1);
  }
}

function avg(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

main().catch((err) => {
  console.error('Load test failed:', err);
  process.exit(1);
});
