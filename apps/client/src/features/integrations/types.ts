export type IntegrationStatus = "connected" | "disconnected" | "error";

export interface CalendarIntegration {
  provider: "google" | "outlook";
  status: IntegrationStatus;
  lastSyncAt?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
}
