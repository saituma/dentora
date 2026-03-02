import { createSlice } from "@reduxjs/toolkit";
import type { AuthState } from "./types";

const initialState: AuthState = {
  user: null,
  clinic: null,
  isAuthenticated: false,
  onboardingStatus: "clinic-profile",
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials: (
      state,
      action: {
        payload: {
          user: AuthState["user"];
          clinic: AuthState["clinic"];
          onboardingStatus?: AuthState["onboardingStatus"];
        };
      }
    ) => {
      state.user = action.payload.user;
      state.clinic = action.payload.clinic;
      state.isAuthenticated = !!action.payload.user;
      if (action.payload.onboardingStatus !== undefined) {
        state.onboardingStatus = action.payload.onboardingStatus;
      }
    },
    setOnboardingStatus: (
      state,
      action: { payload: AuthState["onboardingStatus"] }
    ) => {
      state.onboardingStatus = action.payload;
    },
    logout: () => initialState,
  },
});

export const { setCredentials, setOnboardingStatus, logout } =
  authSlice.actions;
export default authSlice.reducer;
