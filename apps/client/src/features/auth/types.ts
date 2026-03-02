export interface User {
  id: string;
  email: string;
  name: string;
  clinicId: string;
}

export interface Clinic {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone?: string;
  address?: string;
  timezone: string;
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
  clinic: Clinic | null;
  isAuthenticated: boolean;
  onboardingStatus: OnboardingStep | "complete";
}
