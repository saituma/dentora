
import { logger } from '../../lib/logger.js';
import { executeLlmWithFailover } from '../ai/engine/index.js';
import { computeReadinessScore } from '../onboarding/onboarding.service.js';
import type { LlmMessage } from '../ai/providers/base.js';
import type { ReadinessScorecard, ValidationIssue } from '../onboarding/onboarding.service.js';

export interface ChatTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  extractedFields?: Record<string, unknown>;
  validationResult?: { errors: ValidationIssue[]; warnings: ValidationIssue[] };
}

export interface ChatSession {
  tenantId: string;
  turns: ChatTurn[];
  pendingFields: string[];
  readinessScore: number;
  isComplete: boolean;
}

const CONFIG_CHAT_SYSTEM_PROMPT = `You are the Configuration AI for a dental clinic receptionist system.
Your job is to collect complete, structured, and unambiguous clinic configuration data.
Ask focused questions one at a time when required fields are missing or unclear.
Convert user responses into schema-compliant values.
Always validate booking, escalation, policy, and tone settings for safety and consistency.
If information is ambiguous, ask a clarifying question instead of guessing.
Mark each field status as complete, needs_clarification, or blocked.
When all required fields pass validation, output a deployment readiness summary and trigger the deployment handoff.

You must respond in JSON format with the following structure:
{
  "message": "Your conversational response to the user",
  "extractedFields": { "fieldName": "value" },
  "fieldStatuses": { "fieldName": "complete|needs_clarification|blocked" },
  "nextQuestion": "The specific question to ask next, if any",
  "isConfigComplete": false
}

Current configuration gaps that need to be addressed:
{GAPS_PLACEHOLDER}

Priority order for questions:
1. Safety-critical policy fields (escalation, emergency)
2. Booking rule fields required for transactional correctness
3. Service definitions and constraints
4. Tone and FAQ refinements
`;

export async function processConfigChatTurn(input: {
  tenantId: string;
  userMessage: string;
  conversationHistory: ChatTurn[];
}): Promise<{
  response: string;
  extractedFields: Record<string, unknown>;
  isComplete: boolean;
  readinessScore: number;
  provider: string;
  latencyMs: number;
}> {
  const scorecard = await computeReadinessScore(input.tenantId);
  const gaps = buildGapsDescription(scorecard);

  const systemPrompt = CONFIG_CHAT_SYSTEM_PROMPT.replace('{GAPS_PLACEHOLDER}', gaps);

  const messages: LlmMessage[] = [
    { role: 'system', content: systemPrompt },
    ...input.conversationHistory.map((t) => ({
      role: t.role as LlmMessage['role'],
      content: t.content,
    })),
    { role: 'user', content: input.userMessage },
  ];

  const result = await executeLlmWithFailover({
    workloadType: 'llm',
    tenantId: input.tenantId,
    maxLatencyMs: 10000,
    minReliability: 0.85,
    llmRequest: {
      model: 'gpt-4o-mini',
      tenantId: input.tenantId,
      messages,
      temperature: 0.3,
      maxTokens: 1000,
    },
  });

  let extractedFields: Record<string, unknown> = {};
  let responseMessage = result.content;
  let isComplete = false;

  try {
    const parsed = JSON.parse(result.content);
    responseMessage = parsed.message || result.content;
    extractedFields = parsed.extractedFields || {};
    isComplete = parsed.isConfigComplete || false;
  } catch {
    logger.debug({ tenantId: input.tenantId }, 'Config chat returned non-JSON response');
  }

  logger.info(
    {
      tenantId: input.tenantId,
      provider: result.selectionResult.providerName,
      latencyMs: result.latencyMs,
      fieldsExtracted: Object.keys(extractedFields).length,
      isComplete,
    },
    'Config chat turn processed',
  );

  return {
    response: responseMessage,
    extractedFields,
    isComplete,
    readinessScore: scorecard.totalScore,
    provider: result.provider,
    latencyMs: result.latencyMs,
  };
}

function buildGapsDescription(scorecard: ReadinessScorecard): string {
  const gaps: string[] = [];

  const domains = [
    { name: 'Clinic Profile', data: scorecard.clinicProfile },
    { name: 'Service Catalog', data: scorecard.serviceCatalog },
    { name: 'Booking Rules', data: scorecard.bookingRules },
    { name: 'Policies & Escalation', data: scorecard.policyEscalation },
    { name: 'Tone Profile', data: scorecard.toneProfile },
    { name: 'Integrations', data: scorecard.integrations },
  ];

  for (const domain of domains) {
    if (domain.data.issues.length > 0) {
      gaps.push(`\n${domain.name} (score: ${domain.data.score}%):`);
      for (const issue of domain.data.issues) {
        gaps.push(`  - [${issue.severity}] ${issue.message}`);
      }
    }
  }

  return gaps.length > 0
    ? gaps.join('\n')
    : 'All configuration domains are complete. Verify deployment readiness.';
}
