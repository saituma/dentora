/**
 * Country dial codes for the phone input used in the "Test our AI Agent" demo.
 * `iso` is the ISO 3166-1 alpha-2 code; the flag emoji is derived from it at
 * render time (no image assets needed). Default selection is GB (United Kingdom).
 */
export interface Country {
  iso: string;
  name: string;
  dial: string;
}

export const DEFAULT_COUNTRY_ISO = 'GB';

/** Derive a 🇬🇧-style flag emoji from an ISO alpha-2 code. */
export function flagEmoji(iso: string): string {
  return iso.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

// Curated, commonly-needed list. UK & Ireland first (primary market), then the
// rest alphabetically. Extend freely — the component reads this array directly.
export const COUNTRIES: Country[] = [
  { iso: 'GB', name: 'United Kingdom', dial: '+44' },
  { iso: 'IE', name: 'Ireland', dial: '+353' },
  { iso: 'US', name: 'United States', dial: '+1' },
  { iso: 'AU', name: 'Australia', dial: '+61' },
  { iso: 'CA', name: 'Canada', dial: '+1' },
  { iso: 'NZ', name: 'New Zealand', dial: '+64' },
  { iso: 'AE', name: 'United Arab Emirates', dial: '+971' },
  { iso: 'AT', name: 'Austria', dial: '+43' },
  { iso: 'BE', name: 'Belgium', dial: '+32' },
  { iso: 'BR', name: 'Brazil', dial: '+55' },
  { iso: 'CH', name: 'Switzerland', dial: '+41' },
  { iso: 'CN', name: 'China', dial: '+86' },
  { iso: 'CZ', name: 'Czechia', dial: '+420' },
  { iso: 'DE', name: 'Germany', dial: '+49' },
  { iso: 'DK', name: 'Denmark', dial: '+45' },
  { iso: 'EG', name: 'Egypt', dial: '+20' },
  { iso: 'ES', name: 'Spain', dial: '+34' },
  { iso: 'FI', name: 'Finland', dial: '+358' },
  { iso: 'FR', name: 'France', dial: '+33' },
  { iso: 'GR', name: 'Greece', dial: '+30' },
  { iso: 'HK', name: 'Hong Kong', dial: '+852' },
  { iso: 'HU', name: 'Hungary', dial: '+36' },
  { iso: 'IL', name: 'Israel', dial: '+972' },
  { iso: 'IN', name: 'India', dial: '+91' },
  { iso: 'IT', name: 'Italy', dial: '+39' },
  { iso: 'JP', name: 'Japan', dial: '+81' },
  { iso: 'KE', name: 'Kenya', dial: '+254' },
  { iso: 'KR', name: 'South Korea', dial: '+82' },
  { iso: 'MX', name: 'Mexico', dial: '+52' },
  { iso: 'MY', name: 'Malaysia', dial: '+60' },
  { iso: 'NG', name: 'Nigeria', dial: '+234' },
  { iso: 'NL', name: 'Netherlands', dial: '+31' },
  { iso: 'NO', name: 'Norway', dial: '+47' },
  { iso: 'PH', name: 'Philippines', dial: '+63' },
  { iso: 'PL', name: 'Poland', dial: '+48' },
  { iso: 'PT', name: 'Portugal', dial: '+351' },
  { iso: 'RO', name: 'Romania', dial: '+40' },
  { iso: 'SA', name: 'Saudi Arabia', dial: '+966' },
  { iso: 'SE', name: 'Sweden', dial: '+46' },
  { iso: 'SG', name: 'Singapore', dial: '+65' },
  { iso: 'TR', name: 'Türkiye', dial: '+90' },
  { iso: 'ZA', name: 'South Africa', dial: '+27' },
];

export const DEFAULT_COUNTRY: Country =
  COUNTRIES.find((c) => c.iso === DEFAULT_COUNTRY_ISO) ?? COUNTRIES[0];
