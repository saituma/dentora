export interface DashboardStats {
  totalCalls: number;
  averageDurationSeconds: number;
  completionRate: number;
  totalCost: string;
  sentimentBreakdown: Record<string, number>;
  topIntents: Array<{ intent: string; count: number }>;
  callsByStatus: Record<string, number>;
  averageLatencyMs: number;
}

export interface HourlyVolume {
  hour: string;
  calls: number;
}
