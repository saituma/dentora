import type { OnboardingStep } from '@/features/auth/types';

export type ServiceCategory =
  | 'preventive'
  | 'restorative'
  | 'cosmetic'
  | 'emergency'
  | 'orthodontic'
  | 'other';

export type FaqCategory =
  | 'insurance'
  | 'hours'
  | 'procedures'
  | 'billing'
  | 'preparation'
  | 'other';

export interface KnowledgeStaffForm {
  name: string;
  role: string;
}

export interface KnowledgeServiceForm {
  serviceName: string;
  category: ServiceCategory;
  durationMinutes: number;
  price: string;
  description: string;
}

export interface KnowledgeFaqForm {
  question: string;
  answer: string;
  category: FaqCategory;
}

export interface UploadedContextFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  content: string;
}

export const STEPS = [
  { id: 'clinic-profile', label: 'Profile' },
  { id: 'plan', label: 'Plan' },
  { id: 'knowledge-base', label: 'Knowledge' },
  { id: 'voice', label: 'Voice' },
  { id: 'rules', label: 'Rules' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'ai-chat', label: 'AI Chat' },
  { id: 'download', label: 'Download' },
  { id: 'test-call', label: 'Test' },
  { id: 'complete', label: 'Done' },
] as const;

export const STEP_ORDER = STEPS.map((step) => step.id) as OnboardingStep[];

export const STEP_META: Record<OnboardingStep, { title: string; description: string }> = {
  'clinic-profile': {
    title: 'Tell us about your clinic',
    description: 'Set your core profile details so your AI sounds like your front desk.',
  },
  plan: {
    title: 'Choose your plan',
    description: 'Pick the plan that best fits your clinic. You can change it later.',
  },
  'knowledge-base': {
    title: 'Tell us your clinic knowledge',
    description: 'Fill in services, pricing, and FAQs so responses stay accurate and consistent.',
  },
  voice: {
    title: 'Choose voice and personality',
    description: 'Pick an ElevenLabs voice and greeting style that matches your brand and patient experience.',
  },
  rules: {
    title: 'Set booking rules',
    description: 'Define the scheduling rules your AI should follow when booking patients.',
  },
  integrations: {
    title: 'Connect key tools',
    description: 'Integrate calendar tools now or skip and connect later from settings.',
  },
  schedule: {
    title: 'Set clinic hours and breaks',
    description: 'Define real working days, opening hours, and break windows so booking always respects your clinic schedule.',
  },
  'ai-chat': {
    title: 'AI Chat to upload data',
    description: 'Upload clinic docs, scripts, pricing, and FAQs so the AI answers like your front desk.',
  },
  download: {
    title: 'Download your clinic context',
    description: 'Download a PDF of your full onboarding data for review, record-keeping, and updates.',
  },
  'test-call': {
    title: 'Run a quick test call',
    description: 'Make sure everything works before going live with patient traffic.',
  },
  complete: {
    title: 'Complete setup',
    description: 'Final step before entering your dashboard.',
  },
};
