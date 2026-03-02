export interface AnalyticsMetrics {
  missedCallCaptureRate: number;
  callToBookingConversion: number;
  revenueRecovered: number;
  totalCalls: number;
}

export interface ChartDataPoint {
  date: string;
  value: number;
  label?: string;
}
