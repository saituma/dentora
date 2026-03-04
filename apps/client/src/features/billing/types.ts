export interface BillingSummary {
  totalCost: string;
  totalCalls: number;
  costBreakdown: Record<string, string>;
  period: { start: string; end: string };
}

export interface DailyCostTrend {
  date: string;
  cost: string;
  calls: number;
}

export interface PlanLimits {
  withinLimits: boolean;
  currentUsage: { calls: number; cost: string };
  plan: string;
}
