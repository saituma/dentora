import { createSlice } from "@reduxjs/toolkit";
import type { AuthState } from "./types";

const initialState: AuthState = {
  user: null,
  tenantId: null,
  isAuthenticated: false,
  onboardingStatus: "clinic-profile",
  isHydrated: false,
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
          tenantId: AuthState["tenantId"];
          onboardingStatus?: AuthState["onboardingStatus"];
        };
      }
    ) => {
      state.user = action.payload.user;
      state.tenantId = action.payload.tenantId;
      state.isAuthenticated = !!action.payload.user;
      state.isHydrated = true;
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
    setHydrated: (state) => {
      state.isHydrated = true;
    },
    logout: (state) => {
      state.user = null;
      state.tenantId = null;
      state.isAuthenticated = false;
      state.onboardingStatus = "clinic-profile";
      state.isHydrated = true;
    },
  },
});

export const { setCredentials, setOnboardingStatus, setHydrated, logout } =
  authSlice.actions;
export default authSlice.reducer;
