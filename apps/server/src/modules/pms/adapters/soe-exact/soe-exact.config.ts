export type SoeExactAuthType = 'unknown' | 'oauth2' | 'api_key' | 'basic' | 'connector_token';
export type SoeExactConnectorMode = 'unknown' | 'cloud' | 'on_prem_connector';
export type SoeExactPollingMode = 'unknown' | 'none' | 'required' | 'optional';
export type SoeExactWebhookMode = 'unknown' | 'none' | 'available' | 'required';
export type SoeExactVendorContactStatus =
  | 'not_started'
  | 'requested'
  | 'in_review'
  | 'approved'
  | 'blocked';

export interface SoeExactConfig {
  authType: SoeExactAuthType;
  baseUrl?: string;
  connectorMode: SoeExactConnectorMode;
  pollingMode: SoeExactPollingMode;
  webhookMode: SoeExactWebhookMode;
  vendorContactStatus: SoeExactVendorContactStatus;
}

export const defaultSoeExactConfig: SoeExactConfig = {
  authType: 'unknown',
  connectorMode: 'unknown',
  pollingMode: 'unknown',
  webhookMode: 'unknown',
  vendorContactStatus: 'not_started',
};

export type SoeExactReadinessCheckId =
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

export interface SoeExactReadinessCheck {
  id: SoeExactReadinessCheckId;
  question: string;
  status: 'unknown' | 'yes' | 'no' | 'blocked';
}

export const soeExactReadinessChecklist: SoeExactReadinessCheck[] = [
  {
    id: 'api_docs_available',
    question: 'Are official SOE/EXACT API docs available?',
    status: 'unknown',
  },
  {
    id: 'sandbox_demo_available',
    question: 'Is a sandbox or demo SOE/EXACT environment available?',
    status: 'unknown',
  },
  {
    id: 'appointment_read_supported',
    question: 'Does SOE/EXACT support appointment read?',
    status: 'unknown',
  },
  {
    id: 'availability_supported',
    question: 'Does SOE/EXACT support availability search?',
    status: 'unknown',
  },
  {
    id: 'appointment_create_supported',
    question: 'Does SOE/EXACT support appointment create?',
    status: 'unknown',
  },
  {
    id: 'cancel_reschedule_supported',
    question: 'Does SOE/EXACT support cancel and reschedule?',
    status: 'unknown',
  },
  {
    id: 'patient_lookup_supported',
    question: 'Does SOE/EXACT support patient lookup?',
    status: 'unknown',
  },
  {
    id: 'webhooks_or_polling_supported',
    question: 'Does SOE/EXACT support webhooks or polling?',
    status: 'unknown',
  },
  {
    id: 'on_prem_connector_required',
    question: 'Is an on-prem connector required for SOE/EXACT?',
    status: 'unknown',
  },
  {
    id: 'auth_model_confirmed',
    question: 'Is the SOE/EXACT auth model confirmed?',
    status: 'unknown',
  },
  {
    id: 'data_processing_legal_approved',
    question: 'Is SOE/EXACT data-processing/legal approved?',
    status: 'unknown',
  },
];
