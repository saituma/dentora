import { createSlice } from "@reduxjs/toolkit";
import type { CallSession } from "./types";

interface CallsState {
  selectedCall: CallSession | null;
  filters: {
    status: string;
    search: string;
  };
}

const initialState: CallsState = {
  selectedCall: null,
  filters: {
    status: "all",
    search: "",
  },
};

const callsSlice = createSlice({
  name: "calls",
  initialState,
  reducers: {
    setSelectedCall: (state, action: { payload: CallSession | null }) => {
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

export const { setSelectedCall, setFilters } = callsSlice.actions;
export default callsSlice.reducer;
