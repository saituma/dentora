import { createSlice } from "@reduxjs/toolkit";

interface BillingState {
  selectedPeriod: string;
}

const initialState: BillingState = {
  selectedPeriod: "current",
};

const billingSlice = createSlice({
  name: "billing",
  initialState,
  reducers: {
    setSelectedPeriod: (state, action: { payload: string }) => {
      state.selectedPeriod = action.payload;
    },
  },
});

export const { setSelectedPeriod } = billingSlice.actions;
export default billingSlice.reducer;
