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
  endReason?: string | null;
  intentSummary?: string | null;
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

export interface CallTranscriptTurn {
  turn?: number;
  role?: string;
  content?: string;
  text?: string;
  timestamp?: string;
}

export interface CallTranscript {
  id: string;
  tenantId: string;
  callSessionId: string;
  fullTranscript: CallTranscriptTurn[];
  summary?: string | null;
  sentiment?: string | null;
  intentDetected?: string | null;
  createdAt: string;
}

export interface CallCostLineItem {
  id: string;
  provider: string;
  service: string;
  units: number;
  unitCost: string;
  totalCost: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface CallCostBreakdown {
  id: string;
  tenantId: string;
  callSessionId: string;
  totalCost: string;
  currency: string;
  createdAt: string;
  lineItems: CallCostLineItem[];
}
