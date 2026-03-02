import { createSlice } from "@reduxjs/toolkit";
import type { Subscription, Usage, Invoice } from "./types";

interface BillingState {
  subscription: Subscription | null;
  usage: Usage | null;
  invoices: Invoice[];
}

const initialState: BillingState = {
  subscription: null,
  usage: null,
  invoices: [],
};

const billingSlice = createSlice({
  name: "billing",
  initialState,
  reducers: {
    setSubscription: (state, action: { payload: Subscription | null }) => {
      state.subscription = action.payload;
    },
    setUsage: (state, action: { payload: Usage | null }) => {
      state.usage = action.payload;
    },
    setInvoices: (state, action: { payload: Invoice[] }) => {
      state.invoices = action.payload;
    },
  },
});

export const { setSubscription, setUsage, setInvoices } =
  billingSlice.actions;
export default billingSlice.reducer;
