export type CsR4PlusAuthType = 'unknown' | 'oauth2' | 'api_key' | 'basic' | 'connector_token';
export type CsR4PlusConnectorMode = 'unknown' | 'cloud' | 'on_prem_connector';
export type CsR4PlusPollingMode = 'unknown' | 'none' | 'required' | 'optional';
export type CsR4PlusWebhookMode = 'unknown' | 'none' | 'available' | 'required';
export type CsR4PlusVendorContactStatus =
  | 'not_started'
  | 'requested'
  | 'in_review'
  | 'approved'
  | 'blocked';

export interface CsR4PlusConfig {
  authType: CsR4PlusAuthType;
  baseUrl?: string;
  connectorMode: CsR4PlusConnectorMode;
  pollingMode: CsR4PlusPollingMode;
  webhookMode: CsR4PlusWebhookMode;
  vendorContactStatus: CsR4PlusVendorContactStatus;
}

export const defaultCsR4PlusConfig: CsR4PlusConfig = {
  authType: 'unknown',
  connectorMode: 'unknown',
  pollingMode: 'unknown',
  webhookMode: 'unknown',
  vendorContactStatus: 'not_started',
};

export type CsR4PlusReadinessCheckId =
  | 'api_docs_available'
  | 'sandbox_demo_available'
  | 'appointment_read_supported'
  | 'availability_supported'
  | 'appointment_create_supported'
  | 'cancel_reschedule_supported'
  | 'patient_lookup_supported'
  | 'webhooks_or_polling_supported'
  | 'on_prem_connector_required'
  | 'auth_model_confirmed'
  | 'data_processing_legal_approved';

export interface CsR4PlusReadinessCheck {
  id: CsR4PlusReadinessCheckId;
  question: string;
  status: 'unknown' | 'yes' | 'no' | 'blocked';
}

export const csR4PlusReadinessChecklist: CsR4PlusReadinessCheck[] = [
  {
    id: 'api_docs_available',
    question: 'Are official CS R4+ API docs available?',
    status: 'unknown',
  },
  {
    id: 'sandbox_demo_available',
    question: 'Is a sandbox or demo CS R4+ environment available?',
    status: 'unknown',
  },
  {
    id: 'appointment_read_supported',
    question: 'Does CS R4+ support appointment read?',
    status: 'unknown',
  },
  {
    id: 'availability_supported',
    question: 'Does CS R4+ support availability search?',
    status: 'unknown',
  },
  {
    id: 'appointment_create_supported',
    question: 'Does CS R4+ support appointment create?',
    status: 'unknown',
  },
  {
    id: 'cancel_reschedule_supported',
    question: 'Does CS R4+ support cancel and reschedule?',
    status: 'unknown',
  },
  {
    id: 'patient_lookup_supported',
    question: 'Does CS R4+ support patient lookup?',
    status: 'unknown',
  },
  {
    id: 'webhooks_or_polling_supported',
    question: 'Does CS R4+ support webhooks or polling?',
    status: 'unknown',
  },
  {
    id: 'on_prem_connector_required',
    question: 'Is an on-prem connector required for CS R4+?',
    status: 'unknown',
  },
  {
    id: 'auth_model_confirmed',
    question: 'Is the CS R4+ auth model confirmed?',
    status: 'unknown',
  },
  {
    id: 'data_processing_legal_approved',
    question: 'Is CS R4+ data-processing/legal approved?',
    status: 'unknown',
  },
];
