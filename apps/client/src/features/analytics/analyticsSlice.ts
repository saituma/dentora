import { createSlice } from "@reduxjs/toolkit";
import type { AnalyticsMetrics, ChartDataPoint } from "./types";

interface AnalyticsState {
  metrics: AnalyticsMetrics | null;
  dateRange: { start: string; end: string };
  granularity: "day" | "week" | "month";
  chartData: ChartDataPoint[];
}

const initialState: AnalyticsState = {
  metrics: null,
  dateRange: { start: "", end: "" },
  granularity: "week",
  chartData: [],
};

const analyticsSlice = createSlice({
  name: "analytics",
  initialState,
  reducers: {
    setMetrics: (state, action: { payload: AnalyticsMetrics | null }) => {
      state.metrics = action.payload;
    },
    setDateRange: (
      state,
      action: { payload: { start: string; end: string } }
    ) => {
      state.dateRange = action.payload;
    },
    setGranularity: (
      state,
      action: { payload: "day" | "week" | "month" }
    ) => {
      state.granularity = action.payload;
    },
    setChartData: (state, action: { payload: ChartDataPoint[] }) => {
      state.chartData = action.payload;
    },
  },
});

export const {
  setMetrics,
  setDateRange,
  setGranularity,
  setChartData,
} = analyticsSlice.actions;
export default analyticsSlice.reducer;
