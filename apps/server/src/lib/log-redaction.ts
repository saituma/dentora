const REDACTED = '[REDACTED]';

const SENSITIVE_KEYS = new Set([
  'callerNumber',
  'callerPhone',
  'phone',
  'phoneNumber',
  'from',
  'to',
  'patientName',
  'firstName',
  'lastName',
  'fullName',
  'name',
  'dateOfBirth',
  'dob',
  'address',
  'transcription',
  'transcript',
  'fullTranscript',
  'text',
  'userText',
  'aiText',
  'raw',
  'content',
]);

const E164_PHONE_PATTERN = /\+[1-9]\d{6,14}\b/g;

export function redactPhoneNumbers(value: string): string {
  return value.replace(E164_PHONE_PATTERN, REDACTED);
}

export function redactLogValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactPhoneNumbers(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactLogValue(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Error) {
    return value;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    redacted[key] = SENSITIVE_KEYS.has(key) ? REDACTED : redactLogValue(entry);
  }

  return redacted;
}

export function sanitizeLogFields<T extends Record<string, unknown>>(fields: T): T {
  return redactLogValue(fields) as T;
}
