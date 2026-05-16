/**
 * Generates a clinic waiting-room ambient audio loop using ElevenLabs Sound Effects API,
 * then converts it to raw mulaw 8000Hz mono for use as background noise during calls.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=sk-... pnpm --filter @repo/server exec tsx src/scripts/generate-clinic-ambient.ts
 *
 * Output: src/assets/clinic-ambient.mulaw  (commit this file)
 */

import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error('ELEVENLABS_API_KEY env var is required');
  process.exit(1);
}

const PROMPT =
  'quiet dental clinic waiting room, soft distant murmured conversation, ' +
  'calm background chatter, occasional phone ringing softly in distance, ' +
  'gentle ambient office sounds, no music, subtle and unobtrusive';

const DURATION_SECONDS = 22;

const ASSET_DIR = join(__dirname, '../assets');
const MP3_PATH = join(ASSET_DIR, 'clinic-ambient.mp3');
const MULAW_PATH = join(ASSET_DIR, 'clinic-ambient.mulaw');

async function generate(): Promise<void> {
  console.warn('Calling ElevenLabs Sound Effects API...');

  const response = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: PROMPT,
      duration_seconds: DURATION_SECONDS,
      prompt_influence: 0.3,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`ElevenLabs error ${response.status}: ${body}`);
    process.exit(1);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('audio')) {
    const body = await response.text();
    console.error(`Unexpected content-type ${contentType}: ${body}`);
    process.exit(1);
  }

  const arrayBuffer = await response.arrayBuffer();
  writeFileSync(MP3_PATH, Buffer.from(arrayBuffer));
  console.warn(`Saved MP3: ${MP3_PATH} (${arrayBuffer.byteLength} bytes)`);

  console.warn('Converting to mulaw 8000Hz mono via ffmpeg...');
  execSync(`ffmpeg -y -i "${MP3_PATH}" -ar 8000 -ac 1 -acodec pcm_mulaw -f mulaw "${MULAW_PATH}"`, {
    stdio: 'inherit',
  });

  unlinkSync(MP3_PATH);
  console.warn(`Done. Ambient audio saved to: ${MULAW_PATH}`);
  console.warn('Commit apps/server/src/assets/clinic-ambient.mulaw to include it in deployment.');
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
