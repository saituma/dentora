import crypto from 'node:crypto';
import WebSocket from 'ws';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function base64Silence(bytes = 160): string {
  // Mu-law silence is 0xFF.
  return Buffer.alloc(bytes, 0xff).toString('base64');
}

async function main(): Promise<void> {
  const wsUrl = requireEnv('MEDIA_STREAM_URL');
  const tenantId = requireEnv('TENANT_ID');
  const configVersionId = requireEnv('CONFIG_VERSION_ID');

  const accountSid = process.env.TWILIO_ACCOUNT_SID || 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  const callSid = process.env.TWILIO_CALL_SID || `CA${crypto.randomBytes(16).toString('hex')}`;
  const streamSid = process.env.TWILIO_STREAM_SID || `MZ${crypto.randomBytes(16).toString('hex')}`;
  const callSessionId = process.env.CALL_SESSION_ID || callSid;

  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    const connected = {
      event: 'connected',
      protocol: 'Call',
      version: '1.0.0',
    };
    ws.send(JSON.stringify(connected));

    const start = {
      event: 'start',
      sequenceNumber: '1',
      start: {
        accountSid,
        streamSid,
        callSid,
        tracks: ['inbound'],
        mediaFormat: {
          encoding: 'audio/x-mulaw',
          sampleRate: 8000,
          channels: 1,
        },
        customParameters: {
          tenantId,
          configVersionId,
          callSessionId,
        },
      },
    };
    ws.send(JSON.stringify(start));

    const payload = base64Silence();
    const media = {
      event: 'media',
      sequenceNumber: '2',
      media: {
        track: 'inbound',
        chunk: '1',
        timestamp: '0',
        payload,
      },
    };

    setTimeout(() => {
      ws.send(JSON.stringify(media));
    }, 300);

    setTimeout(() => {
      const stop = {
        event: 'stop',
        sequenceNumber: '3',
        stop: {
          accountSid,
          callSid,
        },
      };
      ws.send(JSON.stringify(stop));
      ws.close();
    }, 1200);
  });

  ws.on('message', (data) => {
    const text = data.toString();
    console.log(`WS <- ${text}`);
  });

  ws.on('close', () => {
    console.log('WS closed');
  });

  ws.on('error', (err) => {
    console.error('WS error', err);
    process.exit(1);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
