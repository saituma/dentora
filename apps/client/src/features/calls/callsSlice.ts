import { createSlice } from "@reduxjs/toolkit";
import type { CallLog, CallOutcome } from "./types";

interface CallsState {
  callLogs: CallLog[];
  selectedCall: CallLog | null;
  filters: {
    dateRange: { start: string; end: string };
    outcome: CallOutcome | "all";
    search: string;
  };
}

const initialState: CallsState = {
  callLogs: [],
  selectedCall: null,
  filters: {
    dateRange: { start: "", end: "" },
    outcome: "all",
    search: "",
  },
};

const callsSlice = createSlice({
  name: "calls",
  initialState,
  reducers: {
    setCallLogs: (state, action: { payload: CallLog[] }) => {
      state.callLogs = action.payload;
    },
    setSelectedCall: (state, action: { payload: CallLog | null }) => {
      state.selectedCall = action.payload;
    },
    setFilters: (
      state,
      action: {
        payload: Partial<CallsState["filters"]>;
      }
    ) => {
      state.filters = { ...state.filters, ...action.payload };
    },
  },
});

export const { setCallLogs, setSelectedCall, setFilters } = callsSlice.actions;
export default callsSlice.reducer;
