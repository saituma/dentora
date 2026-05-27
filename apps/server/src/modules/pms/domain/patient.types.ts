export interface Patient {
  id?: string;
  externalId?: string;
  fullName?: string;
  phoneNumber: string;
  dateOfBirth?: string | null;
}
