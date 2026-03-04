export interface CallSession {
  id: string;
  tenantId: string;
  twilioCallSid?: string;
  callerNumber: string;
  clinicNumber?: string;
  status: string;
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  aiProvider?: string;
  aiModel?: string;
  costEstimate?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface CallEvent {
  id: string;
  callSessionId: string;
  tenantId: string;
  eventType: string;
  actor?: string;
  payload?: Record<string, unknown>;
  latencyMs?: number;
  timestamp: string;
}
