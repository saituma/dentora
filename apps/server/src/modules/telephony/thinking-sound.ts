import { WebSocket } from 'ws';

// μ-law encode a 16-bit linear PCM sample to 8-bit mulaw
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

// Generate one "tick" — a 3ms impulse followed by silence, total 250ms at 8kHz
function generateTickBuffer(): Buffer {
  const SAMPLE_RATE = 8000;
  const TOTAL_MS = 250;
  const TICK_MS = 3;
  const total = Math.floor((SAMPLE_RATE * TOTAL_MS) / 1000);
  const tickSamples = Math.floor((SAMPLE_RATE * TICK_MS) / 1000);
  const buf = Buffer.alloc(total);

  for (let i = 0; i < total; i++) {
    let pcm = 0;
    if (i < tickSamples) {
      // Soft exponential decay impulse — sounds like a quiet keyboard tap
      const t = i / tickSamples;
      pcm = Math.round(800 * Math.exp(-t * 6) * Math.sin(2 * Math.PI * 1200 * (i / SAMPLE_RATE)));
    }
    buf[i] = linearToMulaw(pcm);
  }
  return buf;
}

// Pre-generate once at module load — 4 ticks with slight rhythm variation
const TICK = generateTickBuffer();
// Build a 1-second loop: tick at 0ms, 280ms, 520ms, 780ms
const LOOP_SAMPLES = 8000; // 1 second
const LOOP_BUFFER = Buffer.alloc(LOOP_SAMPLES);
const OFFSETS = [0, 280, 520, 780];
for (const offsetMs of OFFSETS) {
  const offsetSamples = Math.floor((8000 * offsetMs) / 1000);
  TICK.copy(LOOP_BUFFER, offsetSamples, 0, Math.min(TICK.length, LOOP_SAMPLES - offsetSamples));
}
const LOOP_B64 = LOOP_BUFFER.toString('base64');

function sendThinkingChunk(ws: WebSocket, streamSid: string): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(
    JSON.stringify({
      event: 'media',
      streamSid,
      media: { payload: LOOP_B64 },
    }),
  );
}

function sendClear(ws: WebSocket, streamSid: string): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ event: 'clear', streamSid }));
}

export interface ThinkingSound {
  stop: () => void;
}

export function startThinkingSound(ws: WebSocket, streamSid: string): ThinkingSound {
  // Send first chunk immediately, then loop every ~950ms (slightly under 1s to avoid gaps)
  sendThinkingChunk(ws, streamSid);
  const interval = setInterval(() => sendThinkingChunk(ws, streamSid), 950);

  return {
    stop() {
      clearInterval(interval);
      sendClear(ws, streamSid);
    },
  };
}
