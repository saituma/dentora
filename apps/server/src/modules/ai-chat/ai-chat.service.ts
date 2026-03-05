
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
The person chatting with you is a clinic operator (owner/CEO/admin), not a patient.
Your job is to collect complete, structured, and unambiguous clinic configuration data.
Ask focused questions one at a time when required fields are missing or unclear.
Convert user responses into schema-compliant values.
Always validate booking, escalation, policy, and tone settings for safety and consistency.
If information is ambiguous, ask a clarifying question instead of guessing.
Mark each field status as complete, needs_clarification, or blocked.
Use implementation language such as "I will configure" and "Your receptionist will".
Never role-play as a patient in this configuration chat.
When all required fields pass validation, output a deployment readiness summary and trigger the deployment handoff.
If configuration is not complete, your message MUST include exactly one clear follow-up question.
Do not end an incomplete turn without an explicit question.

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
  let nextQuestion = '';

  try {
    const parsed = JSON.parse(result.content);
    responseMessage = parsed.message || result.content;
    extractedFields = parsed.extractedFields || {};
    isComplete = parsed.isConfigComplete || false;
    nextQuestion = typeof parsed.nextQuestion === 'string' ? parsed.nextQuestion.trim() : '';
  } catch {
    logger.debug({ tenantId: input.tenantId }, 'Config chat returned non-JSON response');
  }

  const hasOpenGaps =
    scorecard.clinicProfile.issues.length > 0 ||
    scorecard.serviceCatalog.issues.length > 0 ||
    scorecard.bookingRules.issues.length > 0 ||
    scorecard.policyEscalation.issues.length > 0 ||
    scorecard.toneProfile.issues.length > 0 ||
    scorecard.integrations.issues.length > 0;

  if (!isComplete && hasOpenGaps && !responseMessage.includes('?')) {
    const fallbackQuestion = nextQuestion || buildFallbackClarifyingQuestion(scorecard);
    if (fallbackQuestion) {
      const normalizedQuestion = fallbackQuestion.trim().endsWith('?')
        ? fallbackQuestion.trim()
        : `${fallbackQuestion.trim()}?`;
      responseMessage = `${responseMessage.trim()}\n\n${normalizedQuestion}`;
    }
  }

  if (!isComplete && hasOpenGaps && isVagueClarificationResponse(responseMessage)) {
    const normalizedQuestion = ensureQuestion(nextQuestion || buildFallbackClarifyingQuestion(scorecard));
    responseMessage = `I still need one specific detail before finalizing this setup.\n\n${normalizedQuestion}`;
  }

  if (isClarityCheckMessage(input.userMessage)) {
    const normalizedQuestion = ensureQuestion(nextQuestion || buildFallbackClarifyingQuestion(scorecard));
    const configSnapshot = extractConfigSnapshotFromHistory(input.conversationHistory);
    responseMessage = buildClarityStatusResponse(scorecard, normalizedQuestion, configSnapshot);
  }

  if (isNeedFromMeMessage(input.userMessage)) {
    const normalizedQuestion = ensureQuestion(nextQuestion || buildFallbackClarifyingQuestion(scorecard));
    const configSnapshot = extractConfigSnapshotFromHistory(input.conversationHistory);
    responseMessage = buildNeedFromMeResponse(scorecard, normalizedQuestion, configSnapshot);
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

function buildFallbackClarifyingQuestion(scorecard: ReadinessScorecard): string {
  if (scorecard.policyEscalation.issues.length > 0) {
    return 'What are your exact escalation and emergency handoff rules your receptionist must follow';
  }

  if (scorecard.bookingRules.issues.length > 0) {
    return 'What booking constraints should I enforce (minimum notice, cancellation cutoff, and max booking window)';
  }

  if (scorecard.serviceCatalog.issues.length > 0) {
    return 'Which core services should I configure first, including duration and price for each';
  }

  if (scorecard.clinicProfile.issues.length > 0) {
    return 'Please confirm your clinic name, primary phone, support email, and timezone';
  }

  if (scorecard.toneProfile.issues.length > 0) {
    return 'What tone and greeting style do you want your receptionist to use with patients';
  }

  if (scorecard.integrations.issues.length > 0) {
    return 'Which integrations should I finalize now, starting with your calendar system';
  }

  return 'What else should I clarify to make your receptionist configuration complete and reliable';
}

function ensureQuestion(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return 'What specific workflow should I configure next?';
  return trimmed.endsWith('?') ? trimmed : `${trimmed}?`;
}

function isVagueClarificationResponse(message: string): boolean {
  const lower = message.toLowerCase();
  const vaguePatterns = [
    'i need to clarify',
    'could you please provide',
    'please provide specific',
    'i need more details',
    'can you clarify',
  ];

  return vaguePatterns.some((pattern) => lower.includes(pattern));
}

function isClarityCheckMessage(message: string): boolean {
  const lower = message.toLowerCase();
  const patterns = [
    'is everything clear',
    'everything clear',
    'are you clear',
    'do you understand',
    'is it clear',
    'got data or not',
  ];
  if (patterns.some((pattern) => lower.includes(pattern))) {
    return true;
  }

  const normalized = lower.replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const regexes = [
    /\bis\s+\w*clear\b/,        // matches typos like "evereythngclear" or joined variants
    /\bis\s+.*\bclear\b/,       // broad "is ... clear" forms
    /\bclear\s+enough\b/,
    /\bevery\w*\s+clear\b/,     // everything/everything-typo + clear
  ];

  return regexes.some((re) => re.test(normalized));
}

function isNeedFromMeMessage(message: string): boolean {
  const lower = message.toLowerCase();
  const patterns = [
    'what do you need from me',
    'what do you need',
    'what do u need',
    'what else do you need',
    'anything else you need',
    'what is missing from me',
  ];

  return patterns.some((pattern) => lower.includes(pattern));
}

function buildClarityStatusResponse(
  scorecard: ReadinessScorecard,
  nextQuestion: string,
  configSnapshot?: Record<string, unknown>,
): string {
  const domains = [
    { name: 'Clinic profile', data: scorecard.clinicProfile },
    { name: 'Service catalog', data: scorecard.serviceCatalog },
    { name: 'Booking rules', data: scorecard.bookingRules },
    { name: 'Policies & escalation', data: scorecard.policyEscalation },
    { name: 'Tone profile', data: scorecard.toneProfile },
    { name: 'Integrations', data: scorecard.integrations },
  ];

  const knownDomains = domains
    .filter((domain) => domain.data.issues.length === 0)
    .map((domain) => domain.name);

  const missingIssues = domains.flatMap((domain) =>
    domain.data.issues.map((issue) => ({
      domain: domain.name,
      message: issue.message,
      severity: issue.severity,
    })),
  );

  const summaryJson = configSnapshot
    ? JSON.stringify(configSnapshot, null, 2)
    : JSON.stringify(
        {
          readinessScore: scorecard.totalScore,
          completedDomains: knownDomains,
        },
        null,
        2,
      );

  if (missingIssues.length === 0) {
    return [
      '### ✅ Looking great — I got your config clearly! ✨',
      '',
      'Here\'s a summary of your current configuration data:',
      '',
      '```json',
      summaryJson,
      '```',
      '',
      `**Readiness score:** ${scorecard.totalScore}%`,
      '',
      'Everything required is complete. If you want extra polish, share any special workflows or edge cases and I\'ll tune behavior for them 💖',
    ].join('\n');
  }

  const missingSummary = missingIssues
    .slice(0, 3)
    .map((item) => `- ${item.domain}: ${item.message}`)
    .join('\n');

  return [
    '### 🧠 Almost there — here\'s what I understand so far',
    '',
    'Here\'s a summary of your current configuration data:',
    '',
    '```json',
    summaryJson,
    '```',
    '',
    `**Readiness score:** ${scorecard.totalScore}%`,
    `**Data I have:** ${knownDomains.length > 0 ? knownDomains.join(', ') : 'None confirmed yet'}`,
    '',
    '**Missing or unclear:**',
    missingSummary,
    '',
    `**Next required detail:** ${nextQuestion}`,
  ].join('\n');
}

function buildNeedFromMeResponse(
  scorecard: ReadinessScorecard,
  nextQuestion: string,
  configSnapshot?: Record<string, unknown>,
): string {
  const domains = [
    { name: 'Clinic profile', data: scorecard.clinicProfile },
    { name: 'Service catalog', data: scorecard.serviceCatalog },
    { name: 'Booking rules', data: scorecard.bookingRules },
    { name: 'Policies & escalation', data: scorecard.policyEscalation },
    { name: 'Tone profile', data: scorecard.toneProfile },
    { name: 'Integrations', data: scorecard.integrations },
  ];

  const missingIssues = domains.flatMap((domain) =>
    domain.data.issues.map((issue) => ({
      domain: domain.name,
      message: issue.message,
    })),
  );

  const summaryJson = configSnapshot
    ? JSON.stringify(configSnapshot, null, 2)
    : JSON.stringify({ readinessScore: scorecard.totalScore }, null, 2);

  if (missingIssues.length === 0) {
    return [
      '### ✅ You are all set — I don\'t need anything required from you right now',
      '',
      '```json',
      summaryJson,
      '```',
      '',
      `**Readiness score:** ${scorecard.totalScore}%`,
      '',
      'Optional (recommended): share 1–3 special workflows or edge cases so I can fine-tune receptionist behavior even further ✨',
    ].join('\n');
  }

  const missingSummary = missingIssues
    .slice(0, 5)
    .map((item) => `- ${item.domain}: ${item.message}`)
    .join('\n');

  return [
    '### 📝 Here\'s exactly what I still need from you',
    '',
    `**Readiness score:** ${scorecard.totalScore}%`,
    '',
    missingSummary,
    '',
    `**Next required detail:** ${nextQuestion}`,
  ].join('\n');
}

function extractConfigSnapshotFromHistory(
  history: ChatTurn[],
): Record<string, unknown> | undefined {
  const systemContext = [...history]
    .reverse()
    .find((turn) => turn.role === 'system' && turn.content.includes('[CONFIG_CONTEXT]'));

  if (!systemContext) return undefined;

  const rawLines = systemContext.content
    .replace('[CONFIG_CONTEXT]', '')
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (rawLines.length === 0) return undefined;

  const keyMap: Record<string, string> = {
    'clinic name': 'clinicName',
    timezone: 'timezone',
    'primary phone': 'primaryPhone',
    'support email': 'supportEmail',
    'voice tone': 'voiceTone',
    greeting: 'greeting',
    'default appointment duration': 'defaultAppointmentDuration',
    'cancellation notice': 'cancellationNotice',
    'advance booking window': 'advanceBookingWindow',
    'services configured': 'servicesConfigured',
    'faqs configured': 'faqsConfigured',
    'google calendar connected': 'googleCalendarConnected',
    'readiness score': 'readinessScore',
  };

  const snapshot: Record<string, unknown> = {};

  for (const line of rawLines) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;

    const rawKey = line.slice(0, idx).trim().toLowerCase();
    const rawValue = line.slice(idx + 1).trim();
    const mappedKey = keyMap[rawKey];
    if (!mappedKey) continue;

    let parsedValue: unknown = rawValue;
    if (/^\d+%$/.test(rawValue)) {
      parsedValue = Number(rawValue.replace('%', ''));
    } else if (/^\d+$/.test(rawValue)) {
      parsedValue = Number(rawValue);
    } else if (rawValue.toLowerCase() === 'yes') {
      parsedValue = true;
    } else if (rawValue.toLowerCase() === 'no') {
      parsedValue = false;
    }

    snapshot[mappedKey] = parsedValue;
  }

  return Object.keys(snapshot).length > 0 ? snapshot : undefined;
}
