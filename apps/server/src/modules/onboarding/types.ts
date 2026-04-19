export interface OnboardingStatus {
  tenantId: string;
  currentStep: string;
  completedSteps: string[];
  readinessScore: number;
  validationErrors: ValidationIssue[];
  validationWarnings: ValidationIssue[];
  isReady: boolean;
  /** True when at least one config version has been published (Go Live). */
  hasPublishedConfig: boolean;
}

export interface ValidationIssue {
  domain: string;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ReadinessScorecard {
  clinicProfile: { score: number; weight: number; issues: ValidationIssue[] };
  serviceCatalog: { score: number; weight: number; issues: ValidationIssue[] };
  bookingRules: { score: number; weight: number; issues: ValidationIssue[] };
  policyEscalation: { score: number; weight: number; issues: ValidationIssue[] };
  toneProfile: { score: number; weight: number; issues: ValidationIssue[] };
  integrations: { score: number; weight: number; issues: ValidationIssue[] };
  totalScore: number;
  isDeployable: boolean;
}

export interface AvailableVoiceOption {
  voiceId: string;
  name: string;
  label: string;
  previewUrl?: string;
  gender?: string;
  accent?: string;
  locale?: string;
  category?: string;
  rawCategory?: string;
  requiresPaidPlan?: boolean;
  liveSupported?: boolean;
}
