/** Stored on clinic profile; used by AI for provider matching and appointment booking. */
export interface StaffMember {
  /** Stable id for references (optional for legacy rows). */
  id?: string;
  name: string;
  role: string;
  phone?: string;
  /** When true (default), AI may offer this person as a bookable provider. */
  acceptsAppointments?: boolean;
  /**
   * Days of the week this person works, e.g. ['monday','tuesday','wednesday'].
   * When set, AI uses this to answer "who works on [day]?" questions.
   */
  workingDays?: string[];
}

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
  staffMembers?: StaffMember[];
  description?: string;
  createdAt: string;
  updatedAt: string;
}
