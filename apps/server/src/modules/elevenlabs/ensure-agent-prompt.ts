import { resolveApiKey } from '../api-keys/api-key.service.js';
import { logger } from '../../lib/logger.js';

const patchedAgents = new Set<string>();

const HARDCODED_DATE_PATTERNS = [
  /today(?:'s date)? is \w+ \d{1,2}(?:,? \d{4})?/gi,
  /the current date is \w+ \d{1,2}(?:,? \d{4})?/gi,
  /today is \d{4}-\d{2}-\d{2}/gi,
  /the date is \d{4}-\d{2}-\d{2}/gi,
  /today(?:'s date)? is \d{1,2}\/\d{1,2}\/\d{2,4}/gi,
  /current date:\s*\w+ \d{1,2}(?:,? \d{4})?/gi,
  /today(?:'s date)?:\s*\w+ \d{1,2}(?:,? \d{4})?/gi,
];

const DATE_REPLACEMENT = "today's date is {{today_date}} and the current year is {{current_year}}";

export async function ensureAgentPromptDates(tenantId: string, agentId: string): Promise<void> {
  if (patchedAgents.has(agentId)) return;

  try {
    const { apiKey } = await resolveApiKey(tenantId, 'elevenlabs');

    const getRes = await fetch(
      `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`,
      { headers: { 'xi-api-key': apiKey } },
    );

    if (!getRes.ok) {
      logger.warn({ agentId, status: getRes.status }, 'Could not fetch agent to check prompt dates');
      return;
    }

    const agent = await getRes.json() as {
      conversation_config?: {
        agent?: {
          prompt?: { prompt?: string };
        };
      };
    };

    const prompt = agent.conversation_config?.agent?.prompt?.prompt;
    if (!prompt) {
      patchedAgents.add(agentId);
      return;
    }

    let patched = prompt;
    let changed = false;
    for (const pattern of HARDCODED_DATE_PATTERNS) {
      const before = patched;
      patched = patched.replace(pattern, DATE_REPLACEMENT);
      if (patched !== before) changed = true;
    }

    if (!changed) {
      if (!patched.includes('{{today_date}}')) {
        patched = `${DATE_REPLACEMENT}. ${patched}`;
        changed = true;
      }
    }

    if (changed) {
      const patchRes = await fetch(
        `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`,
        {
          method: 'PATCH',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            conversation_config: {
              agent: {
                prompt: { prompt: patched },
              },
            },
          }),
        },
      );

      if (patchRes.ok) {
        logger.info({ agentId }, 'Patched ElevenLabs agent prompt to use dynamic date variables');
      } else {
        const body = await patchRes.text();
        logger.warn({ agentId, status: patchRes.status, body: body.slice(0, 300) }, 'Failed to patch agent prompt');
      }
    }

    patchedAgents.add(agentId);
  } catch (err) {
    logger.warn({ err, agentId }, 'ensureAgentPromptDates failed (non-blocking)');
  }
}
