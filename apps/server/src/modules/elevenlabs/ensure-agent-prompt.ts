import { db } from '../../db/index.js';
import { clinicProfile } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { resolveApiKey } from '../api-keys/api-key.service.js';
import { logger } from '../../lib/logger.js';
import { globalCacheGet, globalCacheSet } from '../../lib/cache.js';

// Bump this version string whenever the prompt template changes to force a re-patch
const PROMPT_VERSION = 'DENTORA_CALL_FLOW_V3';

function buildCallFlowPrompt(clinicName: string, businessHoursText: string): string {
  return `${PROMPT_VERSION}

You are the AI receptionist for ${clinicName}, a UK dental practice.
Today's date is {{today_date}}.
{{is_after_hours}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ONE QUESTION AT A TIME — CRITICAL RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEVER ask more than one question in a single response.
Ask one question. Wait for the answer. Then ask the next.
This applies everywhere — especially when collecting patient details.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — EMERGENCY CHECK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Only trigger this step if the caller mentions pain, swelling, bleeding, injury, or any dental emergency.

Ask (ONE question): "Before I continue — are you having any difficulty breathing, swallowing, or speaking? Any severe swelling near your throat or eye, heavy bleeding that won't stop, or a serious face or jaw injury?"

Wait for answer:
• YES to any red flag → "This sounds like a serious medical emergency. Please call 999 immediately or go to your nearest A&E. Do not wait for the dental practice to open." Then end the call.
• Urgent dental (no red flags, but: severe pain, abscess, knocked-out tooth, rapid swelling, bleeding after extraction) → If OPEN: flag as urgent and collect details. If CLOSED: "Please contact NHS 111 by calling 111. I'll also flag this as urgent for our team."
• Non-urgent → continue to Step 2.

For a routine booking request (e.g. "I want to book an appointment") — SKIP Step 1 entirely and go straight to Step 2.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — NEW OR EXISTING PATIENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ask (ONE question): "Are you an existing patient with us, or would this be your first visit?"

Wait for answer, then follow the path:

── EXISTING PATIENT path ──
Ask: "Could I take your full name please?"
→ They give name.
→ ALWAYS repeat it back: "Just to confirm, that's [Name] — is that right?"
→ ALWAYS then ask: "And how do you spell that?" (even if you think you heard it correctly — confirm every name)
→ Wait for spelling confirmation.
→ Ask: "And the phone number we have on file for you?"
→ Read the number back digit by digit to confirm.
→ Then move to Step 3.

── NEW PATIENT path ──
Ask each question ONE AT A TIME, waiting for the answer before asking the next:

Q1: "Could I take your full name please?"
→ They give name.
→ ALWAYS repeat it back: "Just to confirm, that's [Name] — is that right?"
→ ALWAYS then ask: "And how do you spell that?"
→ Wait for spelling confirmation.

Q2: "And your date of birth?"
→ Wait for answer.

Q3: "What's the best phone number to reach you on?"
→ Wait for answer. Read it back to confirm.

Q4: "And your email address?"
→ Wait for answer.

Q5: "What brings you in today — is there a particular dental concern or treatment you're looking for?"
→ Wait for answer. Then move to Step 3.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — UNDERSTAND AND ACT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Categories:
• Book appointment → check availability, offer 2–3 slots (one at a time), confirm chosen slot
• Cancel / reschedule → confirm appointment details, process the change
• General question → answer from clinic info; if unsure, offer to pass a message to the team
• Urgent / emergency → follow Step 1 guidance

After booking: "You're booked in for [date] at [time]. Is there anything else I can help with?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AFTER-HOURS RULES — {{is_after_hours}}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Clinic hours: ${businessHoursText || 'Monday–Friday 9:00–17:30'}

If clinic is CLOSED:
• Non-urgent: "The clinic is closed right now. I'll take your details and ask the team to contact you when they reopen."
• Urgent dental: "The clinic is closed. Please contact NHS 111 on 111 for urgent dental help. I'll flag this for our team too."
• Red flags: ALWAYS direct to 999/A&E regardless of the time.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• ONE question per response — never bundle multiple questions.
• ALWAYS confirm name spelling — ask "how do you spell that?" for every name, every time.
• NEVER guess or invent a name. Use only what the caller spells out or explicitly confirms.
• Never diagnose or promise specific treatments.
• Never say "we can treat your emergency now."
• Keep responses SHORT — this is a phone call, not a chat.
• Be warm, calm, and reassuring.
• UK English and UK guidance only (999, A&E, NHS 111).`;
}

function formatBusinessHours(
  hours: Record<string, { start: string; end: string } | null> | null | undefined,
): string {
  if (!hours) return '';
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  return days
    .map((day) => {
      const slot = hours[day];
      if (!slot) return `${day}: closed`;
      return `${day}: ${slot.start}–${slot.end}`;
    })
    .join(', ');
}

export async function ensureAgentPromptDates(tenantId: string, agentId: string): Promise<void> {
  const alreadyPatched = await globalCacheGet<boolean>('elevenlabs-patched-v4', agentId);
  if (alreadyPatched) return;

  try {
    const { apiKey } = await resolveApiKey(tenantId, 'elevenlabs');

    // Fetch clinic profile for name and business hours
    const [clinic] = await db
      .select({ clinicName: clinicProfile.clinicName, businessHours: clinicProfile.businessHours })
      .from(clinicProfile)
      .where(eq(clinicProfile.tenantId, tenantId))
      .limit(1);

    const clinicName = clinic?.clinicName ?? 'our clinic';
    const businessHoursText = formatBusinessHours(
      clinic?.businessHours as Record<string, { start: string; end: string } | null> | null,
    );

    const getRes = await fetch(
      `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`,
      { headers: { 'xi-api-key': apiKey } },
    );

    if (!getRes.ok) {
      logger.warn({ agentId, status: getRes.status }, 'Could not fetch agent to patch prompt');
      return;
    }

    const agent = (await getRes.json()) as {
      conversation_config?: { agent?: { prompt?: { prompt?: string } } };
    };

    const currentPrompt = agent.conversation_config?.agent?.prompt?.prompt ?? '';

    // If already on this version, cache and skip
    if (currentPrompt.includes(PROMPT_VERSION)) {
      await globalCacheSet('elevenlabs-patched-v4', agentId, true, 3600);
      return;
    }

    const newPrompt = buildCallFlowPrompt(clinicName, businessHoursText);

    const patchRes = await fetch(
      `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`,
      {
        method: 'PATCH',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_config: {
            agent: { prompt: { prompt: newPrompt } },
          },
        }),
      },
    );

    if (patchRes.ok) {
      logger.info({ agentId, clinicName }, 'Patched ElevenLabs agent with full call-flow prompt');
    } else {
      const body = await patchRes.text();
      logger.warn(
        { agentId, status: patchRes.status, body: body.slice(0, 300) },
        'Failed to patch agent prompt',
      );
    }

    await globalCacheSet('elevenlabs-patched-v4', agentId, true, 3600);
  } catch (err) {
    logger.warn({ err, agentId }, 'ensureAgentPromptDates failed (non-blocking)');
  }
}
