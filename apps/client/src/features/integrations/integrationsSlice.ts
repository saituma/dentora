import { createSlice } from "@reduxjs/toolkit";
import type {
  CalendarIntegration,
  IntegrationStatus,
  ApiKey,
} from "./types";

interface IntegrationsState {
  calendar: CalendarIntegration | null;
  pmsStatus: IntegrationStatus;
  phoneNumber: string | null;
  apiKeys: ApiKey[];
}

const initialState: IntegrationsState = {
  calendar: null,
  pmsStatus: "disconnected",
  phoneNumber: null,
  apiKeys: [],
};

const integrationsSlice = createSlice({
  name: "integrations",
  initialState,
  reducers: {
    setCalendar: (
      state,
      action: { payload: CalendarIntegration | null }
    ) => {
      state.calendar = action.payload;
    },
    setPmsStatus: (state, action: { payload: IntegrationStatus }) => {
      state.pmsStatus = action.payload;
    },
    setPhoneNumber: (state, action: { payload: string | null }) => {
      state.phoneNumber = action.payload;
    },
    setApiKeys: (state, action: { payload: ApiKey[] }) => {
      state.apiKeys = action.payload;
    },
  },
});

export const {
  setCalendar,
  setPmsStatus,
  setPhoneNumber,
  setApiKeys,
} = integrationsSlice.actions;
export default integrationsSlice.reducer;
