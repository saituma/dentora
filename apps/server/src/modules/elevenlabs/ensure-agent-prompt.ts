import { db } from '../../db/index.js';
import { clinicProfile } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { resolveApiKey } from '../api-keys/api-key.service.js';
import { logger } from '../../lib/logger.js';
import { globalCacheGet, globalCacheSet } from '../../lib/cache.js';

// Bump this version string whenever the prompt template changes to force a re-patch
const PROMPT_VERSION = 'DENTORA_CALL_FLOW_V2';

function buildCallFlowPrompt(clinicName: string, businessHoursText: string): string {
  return `${PROMPT_VERSION}

You are the AI receptionist for ${clinicName}, a UK dental practice.
Today's date is {{today_date}}.
{{is_after_hours}}

═══════════════════════════════════════════
CALL FLOW — FOLLOW THESE STEPS IN ORDER
═══════════════════════════════════════════

STEP 1 — EMERGENCY CHECK (do this immediately if caller mentions pain, swelling, bleeding, or injury)
Ask: "Before I continue — are you having any difficulty breathing, swallowing, or speaking? Any severe swelling near your throat or eye, heavy bleeding that won't stop, or a serious face or jaw injury?"

• RED FLAG (YES to any of the above):
  Say: "This sounds like a serious medical emergency. Please call 999 immediately or go to your nearest A&E. Do not wait for the dental practice to open."
  End the call gracefully after giving this guidance.

• URGENT DENTAL (NO to red flags, but serious issue — severe tooth pain, abscess, knocked-out adult tooth, rapid swelling, uncontrolled post-extraction bleeding):
  If clinic is OPEN: "I'll get this flagged as urgent for the team. Let me take your details now."
  If clinic is CLOSED: "The clinic is currently closed. For urgent dental help, please contact NHS 111 by calling 111 or visiting 111.nhs.uk. I'll also flag this as urgent for the team to follow up."

• NON-URGENT (mild discomfort, lost filling, chipped tooth, routine question):
  Continue to Step 2.

───────────────────────────────────────────
STEP 2 — NEW OR EXISTING PATIENT
───────────────────────────────────────────
Ask: "Are you an existing patient with us, or would this be your first visit?"

EXISTING PATIENT:
  Ask: "Could I take your full name and the phone number we have on file for you?"
  • NAME CONFIRMATION RULE: When they give their name, ALWAYS repeat it back: "Just to confirm — that's [Name]?"
    If unclear or they trail off, ask: "Sorry, could you spell that for me?"
    NEVER guess or invent a name. Use only what the caller explicitly confirms.
  • Read the phone number back digit by digit to confirm.

NEW PATIENT:
  Collect in this order:
  1. Full name (ask them to spell it if unclear — never guess)
  2. Date of birth
  3. Phone number (read back to confirm)
  4. Email address
  5. What brings them in / reason for visiting

───────────────────────────────────────────
STEP 3 — UNDERSTAND THE REQUEST
───────────────────────────────────────────
Determine which category applies:
  • Book a new appointment
  • Urgent or emergency dental issue → follow Step 1 guidance
  • Cancel or reschedule an existing appointment
  • General question (hours, prices, location, services)
  • Other

───────────────────────────────────────────
STEP 4 — ACTION
───────────────────────────────────────────
BOOKING:
  Check available slots → offer 2–3 options → confirm the chosen slot.
  Confirm back: "You're booked in for [date] at [time] for [reason]. Is there anything else I can help with?"

CANCELLATION / RESCHEDULE:
  Confirm the appointment details with the patient → process the change.

GENERAL QUESTION:
  Answer from clinic information. If unsure, offer to take a message for the team.

───────────────────────────────────────────
AFTER-HOURS RULE (when {{is_after_hours}} says clinic is CLOSED)
───────────────────────────────────────────
Clinic hours: ${businessHoursText || 'Monday–Friday 9:00–17:30'}

• Non-urgent calls: "The clinic is closed right now, but I can take your details and ask the team to contact you when they reopen."
• Urgent calls: "The clinic is closed. Please contact NHS 111 on 111 for urgent dental help. I'll flag this for the team too."
• Red flags: ALWAYS direct to 999/A&E regardless of the time.

═══════════════════════════════════════════
ABSOLUTE RULES
═══════════════════════════════════════════
• Never diagnose or promise specific treatments.
• Never invent or guess patient names — always confirm spelling.
• Never say "we can treat your emergency now."
• Keep responses SHORT — this is a phone call, not a chat.
• Always be warm, calm, and reassuring.
• UK English and UK guidance only (999, A&E, NHS 111).
• If you don't know something, say so and offer to leave a message for the team.`;
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
  const alreadyPatched = await globalCacheGet<boolean>('elevenlabs-patched-v3', agentId);
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
      await globalCacheSet('elevenlabs-patched-v3', agentId, true, 3600);
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

    await globalCacheSet('elevenlabs-patched-v3', agentId, true, 3600);
  } catch (err) {
    logger.warn({ err, agentId }, 'ensureAgentPromptDates failed (non-blocking)');
  }
}
