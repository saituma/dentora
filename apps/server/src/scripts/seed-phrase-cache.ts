/* eslint-disable no-console */
/**
 * seed-phrase-cache.ts
 *
 * Run once (or when phrases change) to pre-generate common dental
 * receptionist phrases with ElevenLabs and upload them to R2.
 *
 * After seeding, every call that matches a phrase costs $0 for TTS.
 *
 * Usage:
 *   pnpm --filter @repo/server exec tsx src/scripts/seed-phrase-cache.ts
 *
 * Optional env overrides:
 *   SEED_VOICE_IDS=voiceId1,voiceId2   (default: all 4 below)
 *   SEED_DRY_RUN=true                  (log phrases without generating audio)
 */

import 'dotenv/config';
import { setCachedPhrase } from '../lib/phrase-cache.js';
import { isStorageConfigured } from '../lib/storage.js';

// ── The 4 voices you use ─────────────────────────────────────────────────────
const DEFAULT_VOICE_IDS = [
  'pNInz6obpgDQGcFmaJgB', // professional female
  '21m00Tcm4TlvDq8ikWAM', // warm female
  'EXAVITQu4vr4xnSDxMaL', // friendly female
  'MF3mGyEYCl7XYWbV9V6O', // calm male
];

// ── 50 most common dental receptionist phrases ───────────────────────────────
const PHRASES = [
  // Greetings
  'Good morning, how can I help you today?',
  'Good afternoon, how can I help you today?',
  'Good evening, how can I help you today?',
  'Thank you for calling. How can I help you?',

  // Booking flow
  'Are you an existing patient with us?',
  'What type of appointment are you looking for?',
  'Which dentist would you like to see?',
  'What date works best for you?',
  'I have a slot available. Would that work for you?',
  'Let me check availability for you.',
  'I can book you in for that.',
  'Your appointment is confirmed.',
  'Can I take your name please?',
  'Can I take your date of birth please?',
  'Can I take a contact number for you?',
  'Is that a morning or afternoon appointment?',
  'We have a cancellation available. Would you like it?',
  'I have booked you in. You will receive a confirmation shortly.',

  // Rescheduling
  'When would you like to reschedule to?',
  'I have moved your appointment. Is there anything else I can help with?',
  'Your appointment has been cancelled.',

  // FAQs
  'We do accept NHS patients.',
  'We are a private practice.',
  'We accept most major insurance plans.',
  'We accept BUPA, AXA, and Vitality.',
  'Our hygiene appointments are sixty pounds.',
  'A standard check-up is thirty-five pounds.',
  'We offer interest-free payment plans.',
  'We are open Monday to Friday, nine to five thirty.',
  'We are open on Saturdays from nine to one.',
  'We are located on the high street.',
  'There is free parking available.',
  'We are a five minute walk from the train station.',

  // Emergency
  'Are you in pain at the moment?',
  'We have an emergency slot available today.',
  'Please come in as soon as you can.',
  'I am flagging this as urgent for our team.',

  // Hold and transfer
  'Please bear with me one moment.',
  'I am just checking that for you now.',
  'Let me look into that for you.',
  'I will pass you to a member of our team.',

  // Closing
  'Is there anything else I can help you with?',
  'Thank you for calling. Have a great day.',
  'Thank you for calling. Goodbye.',
  'We look forward to seeing you.',
  'Take care. Goodbye.',

  // Clarification
  'Could you repeat that please?',
  'I did not quite catch that. Could you say it again?',
  'Sorry, could you speak a little more slowly?',

  // Error / escalation
  'I am sorry, I was not able to help with that.',
  'Let me get someone from our team to call you back.',
];

// ─────────────────────────────────────────────────────────────────────────────

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const DRY_RUN = process.env.SEED_DRY_RUN === 'true';

async function generateAudio(text: string, voiceId: string): Promise<Buffer> {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY!,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0,
        use_speaker_boost: true,
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs error ${response.status}: ${err}`);
  }

  const buf = await response.arrayBuffer();
  return Buffer.from(buf);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('── Dentora Phrase Cache Seeder ──────────────────────────');

  if (!ELEVENLABS_API_KEY) {
    console.error('❌  ELEVENLABS_API_KEY is not set');
    process.exit(1);
  }

  if (!isStorageConfigured()) {
    console.error(
      '❌  Cloudflare R2 is not configured (R2_BUCKET, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)',
    );
    process.exit(1);
  }

  const voiceIds = process.env.SEED_VOICE_IDS
    ? process.env.SEED_VOICE_IDS.split(',').map((v) => v.trim())
    : DEFAULT_VOICE_IDS;

  const total = PHRASES.length * voiceIds.length;
  console.log(`Phrases : ${PHRASES.length}`);
  console.log(`Voices  : ${voiceIds.length}`);
  console.log(`Total   : ${total} audio files`);
  console.log(`Dry run : ${DRY_RUN}`);
  console.log('─────────────────────────────────────────────────────────');

  if (DRY_RUN) {
    PHRASES.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
    console.log('\n✅  Dry run complete. Set SEED_DRY_RUN=false to generate.');
    return;
  }

  let done = 0;
  let failed = 0;

  for (const voiceId of voiceIds) {
    console.log(`\nVoice: ${voiceId}`);

    for (const phrase of PHRASES) {
      try {
        const audio = await generateAudio(phrase, voiceId);
        await setCachedPhrase(phrase, voiceId, audio);
        done++;
        process.stdout.write(`  ✓ [${done}/${total}] ${phrase.slice(0, 60)}\n`);

        // 100ms between requests — stay well within ElevenLabs rate limits
        await sleep(100);
      } catch (err) {
        failed++;
        console.error(`  ✗ FAILED: ${phrase.slice(0, 60)}`);
        console.error(`    ${(err as Error).message}`);
      }
    }
  }

  console.log('\n─────────────────────────────────────────────────────────');
  console.log(`✅  Done. ${done} uploaded, ${failed} failed.`);
  console.log('These phrases now cost $0 per call. Run again when phrases change.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
