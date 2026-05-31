import { WebSocket } from 'ws';

function linearToMulaw(sample: number): number {
  const BIAS = 33;
  const CLIP = 32635;

  let sign = 0;
  if (sample < 0) {
    sample = -sample;
    sign = 0x80;
  }
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;

  let exponent = 7;
  let mask = 0x4000;
  while ((sample & mask) === 0 && exponent > 0) {
    exponent--;
    mask >>= 1;
  }

  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

// Build a 1-second typing sound: 4 keyboard taps at 8kHz mulaw
function buildLoopBuffer(): Buffer {
  const SAMPLE_RATE = 8000;
  const buf = Buffer.alloc(SAMPLE_RATE); // 1 second

  // Each tap: 15ms of a decaying tone at decent amplitude, rest is silence
  const TAP_SAMPLES = Math.floor((SAMPLE_RATE * 15) / 1000); // 120 samples
  const TAP_OFFSETS_MS = [0, 240, 500, 740];

  for (const offsetMs of TAP_OFFSETS_MS) {
    const start = Math.floor((SAMPLE_RATE * offsetMs) / 1000);
    for (let i = 0; i < TAP_SAMPLES && start + i < SAMPLE_RATE; i++) {
      const t = i / TAP_SAMPLES;
      const decay = Math.exp(-t * 8);
      const tone = Math.sin(2 * Math.PI * 900 * (i / SAMPLE_RATE));
      const pcm = Math.round(7000 * decay * tone);
      buf[start + i] = linearToMulaw(pcm);
    }
  }

  return buf;
}

const LOOP_B64 = buildLoopBuffer().toString('base64');

function sendChunk(ws: WebSocket, streamSid: string): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ event: 'media', streamSid, media: { payload: LOOP_B64 } }));
}

export function startThinkingSound(ws: WebSocket, streamSid: string): { stop: () => void } {
  sendChunk(ws, streamSid);
  const interval = setInterval(() => sendChunk(ws, streamSid), 950);

  return {
    stop() {
      clearInterval(interval);
      // No clear — let the buffered audio play out naturally.
      // AI audio appends after it in Twilio's queue.
    },
  };
}
