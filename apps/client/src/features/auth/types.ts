export interface User {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
}

export type OnboardingStep =
  | "clinic-profile"
  | "knowledge-base"
  | "voice"
  | "rules"
  | "integrations"
  | "test-call"
  | "complete";

export interface AuthState {
  user: User | null;
  tenantId: string | null;
  isAuthenticated: boolean;
  onboardingStatus: OnboardingStep | "complete";
}
