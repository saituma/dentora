import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_KEY = 'sk_4ece44f5997725b485dfd4baff971395015663ecf05c6c0d';
const OUT_DIR = join(__dirname, '../public/sounds');

const sounds = [
  { name: 'tool-call', text: 'quick soft digital processing tick, subtle UI sound effect', duration: 1.0 },
  { name: 'success', text: 'soft pleasant success chime notification, gentle two tone bell', duration: 1.5 },
  { name: 'click', text: 'soft minimal UI button click tap sound', duration: 0.5 },
  { name: 'listening', text: 'soft microphone activation whoosh, subtle listening start sound', duration: 1.0 },
  { name: 'speaking', text: 'gentle voice assistant speaking start chime, soft notification', duration: 1.0 },
  { name: 'connecting', text: 'subtle connecting establishing sound, soft digital transition', duration: 1.5 },
  { name: 'loading', text: 'soft quiet keyboard typing loop sound effect', duration: 2.0 },
];

async function generate(sound) {
  console.log(`Generating: ${sound.name}...`);
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: sound.text,
      duration_seconds: sound.duration,
      prompt_influence: 0.4,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed ${sound.name}: ${res.status} ${err}`);
  }

  const buffer = await res.arrayBuffer();
  const outPath = join(OUT_DIR, `${sound.name}.mp3`);
  writeFileSync(outPath, Buffer.from(buffer));
  console.log(`  ✓ Saved ${sound.name}.mp3 (${(buffer.byteLength / 1024).toFixed(1)} KB)`);
}

for (const sound of sounds) {
  await generate(sound);
  await new Promise((r) => setTimeout(r, 300));
}

console.log('\nAll sounds generated.');
