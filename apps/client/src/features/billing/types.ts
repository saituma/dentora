export type PlanTier = "starter" | "pro" | "enterprise";

export interface Subscription {
  plan: PlanTier;
  price: number;
  nextBillingDate: string;
  status: "active" | "canceled" | "past_due";
}

export interface Usage {
  callMinutesUsed: number;
  callMinutesLimit: number;
}

export interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: "paid" | "pending";
  downloadUrl?: string;
}
