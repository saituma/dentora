export type CallOutcome = "booked" | "faq" | "transferred" | "abandoned";

export interface CallLog {
  id: string;
  clinicId: string;
  callerPhone: string;
  durationSeconds: number;
  outcome: CallOutcome;
  transcript?: string;
  recordingUrl?: string;
  bookingId?: string;
  createdAt: string;
}
