export interface ClinicProfile {
  id: string;
  tenantId: string;
  clinicName: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  timezone?: string;
  logo?: string;
  brandingColors?: Record<string, string>;
  businessHours?: Record<string, { start: string; end: string } | null>;
  status?: string;
  specialties?: string[];
  staffMembers?: Array<{ name: string; role: string }>;
  description?: string;
  createdAt: string;
  updatedAt: string;
}
