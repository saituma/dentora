export interface BusinessHours {
  [day: string]: { start: string; end: string } | null;
}

export interface ClinicProfile {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone?: string;
  address?: string;
  timezone: string;
  logo?: string;
  brandingColors?: {
    primary?: string;
    secondary?: string;
  };
  businessHours: BusinessHours;
}
