import { createSlice } from "@reduxjs/toolkit";

interface AnalyticsState {
  dateRange: { start: string; end: string };
  granularity: "day" | "week" | "month";
}

const initialState: AnalyticsState = {
  dateRange: { start: "", end: "" },
  granularity: "week",
};

const analyticsSlice = createSlice({
  name: "analytics",
  initialState,
  reducers: {
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
  },
});

export const {
  setDateRange,
  setGranularity,
} = analyticsSlice.actions;
export default analyticsSlice.reducer;
